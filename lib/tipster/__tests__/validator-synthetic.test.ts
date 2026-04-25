// Synthetic tests for Sharkline tipster validator and ESPN parser
// Tests the rewritten validator (line+price check) and ESPN nested-structure parser.

import { describe, it, expect } from "vitest";
import {
  validatePickAgainstPayload,
  TRUSTED_BOOKS,
  type GameData,
  type ValidatorPick,
} from "../analysis-card";
import { parseESPNOddsData } from "../tipster-agent";

// ─── Helper: build a GameData with bookmakers ───

function makeGame(overrides: Partial<GameData> = {}): GameData {
  return {
    id: "test_1",
    sport_key: "basketball_nba",
    sport_title: "NBA",
    home_team: "Boston Celtics",
    away_team: "New York Knicks",
    commence_time: new Date(Date.now() + 3600_000).toISOString(),
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Boston Celtics", price: -180 },
              { name: "New York Knicks", price: 150 },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: "Boston Celtics", price: -110, point: -4.5 },
              { name: "New York Knicks", price: -110, point: 4.5 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: -110, point: 215.5 },
              { name: "Under", price: -110, point: 215.5 },
            ],
          },
        ],
      },
      {
        key: "fanduel",
        title: "FanDuel",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Boston Celtics", price: -175 },
              { name: "New York Knicks", price: 148 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

const trusted = new Set(TRUSTED_BOOKS);

// ─── Test 1: ESPN parser reads nested odds structure ───

describe("ESPN parser — nested odds structure", () => {
  it("extracts moneyline from moneyline.home.close.odds path", () => {
    const espnOdds = {
      provider: { name: "ESPN BET" },
      moneyline: {
        home: { close: { odds: "-150" } },
        away: { close: { odds: "130" } },
      },
    };

    const result = parseESPNOddsData(espnOdds, "Los Angeles Lakers", "Golden State Warriors");

    expect(result.bookmakers).toHaveLength(1);
    expect(result.providerName).toBe("ESPN BET");

    const h2h = result.bookmakers![0].markets.find((m) => m.key === "h2h");
    expect(h2h).toBeDefined();
    expect(h2h!.outcomes).toHaveLength(2);
    expect(h2h!.outcomes[0]).toEqual({ name: "Los Angeles Lakers", price: -150 });
    expect(h2h!.outcomes[1]).toEqual({ name: "Golden State Warriors", price: 130 });
  });

  it("extracts spread from pointSpread.home.close.line/odds path", () => {
    const espnOdds = {
      provider: { name: "ESPN BET" },
      moneyline: {
        home: { close: { odds: "-150" } },
        away: { close: { odds: "130" } },
      },
      pointSpread: {
        home: { close: { line: "-3.5", odds: "-110" } },
        away: { close: { line: "3.5", odds: "-110" } },
      },
    };

    const result = parseESPNOddsData(espnOdds, "Lakers", "Warriors");

    const spreads = result.bookmakers![0].markets.find((m) => m.key === "spreads");
    expect(spreads).toBeDefined();
    expect(spreads!.outcomes[0]).toEqual({ name: "Lakers", price: -110, point: -3.5 });
    expect(spreads!.outcomes[1]).toEqual({ name: "Warriors", price: -110, point: 3.5 });
  });

  it("extracts totals from total.over.close.line/odds path", () => {
    const espnOdds = {
      provider: { name: "ESPN BET" },
      moneyline: {
        home: { close: { odds: "-120" } },
        away: { close: { odds: "100" } },
      },
      total: {
        over: { close: { line: "220.5", odds: "-108" } },
        under: { close: { line: "220.5", odds: "-112" } },
      },
    };

    const result = parseESPNOddsData(espnOdds, "TeamA", "TeamB");

    const totals = result.bookmakers![0].markets.find((m) => m.key === "totals");
    expect(totals).toBeDefined();
    expect(totals!.outcomes[0]).toEqual({ name: "Over", price: -108, point: 220.5 });
    expect(totals!.outcomes[1]).toEqual({ name: "Under", price: -112, point: 220.5 });
  });

  it("falls back to flat format (homeTeamOdds.moneyLine) when nested is absent", () => {
    const espnOdds = {
      provider: { name: "Caesars" },
      homeTeamOdds: { moneyLine: "-200" },
      awayTeamOdds: { moneyLine: "170" },
    };

    const result = parseESPNOddsData(espnOdds, "Home", "Away");

    expect(result.bookmakers).toHaveLength(1);
    const h2h = result.bookmakers![0].markets.find((m) => m.key === "h2h");
    expect(h2h).toBeDefined();
    expect(h2h!.outcomes[0]).toEqual({ name: "Home", price: -200 });
    expect(h2h!.outcomes[1]).toEqual({ name: "Away", price: 170 });
  });

  it("returns empty bookmakers when no odds data is present", () => {
    const result = parseESPNOddsData({}, "Home", "Away");
    expect(result.bookmakers).toHaveLength(0);
    expect(result.providerName).toBeNull();
  });
});

// ─── Test 2: Validator passes a pick with matching line+price ───

describe("Validator — matching line+price", () => {
  it("passes a moneyline pick with correct bookmaker and price", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-180",
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("pass");
  });

  it("passes a moneyline pick within price tolerance (<=5 cents)", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-183", // actual is -180, diff = 3 which is within tolerance of 5
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("pass");
  });

  it("passes a spread pick with correct line and price", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics -4.5",
      odds: "-110",
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("pass");
  });

  it("passes a totals pick with correct line and price", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Over 215.5",
      odds: "-110",
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("pass");
  });
});

// ─── Test 3: Validator drops a pick with mismatched line ───

describe("Validator — mismatched line", () => {
  it("rejects a spread pick with wrong line", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics -6.5", // actual is -4.5
      odds: "-110",
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("rejected");
  });

  it("rejects a totals pick with wrong line", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Over 220.5", // actual is 215.5
      odds: "-110",
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("rejected");
  });
});

// ─── Test 4: Validator drops a pick with mismatched price (>5 cents off) ───

describe("Validator — mismatched price beyond tolerance", () => {
  it("rejects when cited price is >5 cents off from actual (moneyline)", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-210", // actual is -180, diff = 30 >> 5
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("rejected");
    expect((result as { reason: string }).reason).toContain("Price mismatch");
  });

  it("rejects when price is 6 cents off (just beyond tolerance)", () => {
    const game = makeGame();
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-186", // actual is -180, diff = 6 > 5
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("rejected");
  });

  it("auto-corrects bookmaker when cited book wrong but another book has exact match", () => {
    // Create a game where only FanDuel has the exact price.
    // DraftKings has -180, FanDuel has -160.  Cited price is -160 via "Bovada".
    // Should auto-correct to FanDuel since that's the only exact match.
    const game = makeGame({
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Boston Celtics", price: -180 },
                { name: "New York Knicks", price: 150 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Boston Celtics", price: -160 },
                { name: "New York Knicks", price: 138 },
              ],
            },
          ],
        },
      ],
    });
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-160",
      bookmaker: "Bovada", // Not in this game's bookmakers
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("corrected");
    if (result.status === "corrected") {
      expect(result.newBookmaker).toBe("FanDuel");
      expect(result.newOdds).toBe("-160");
    }
  });
});

// ─── Test 5: Validator filters games with zero bookmakers ───

describe("Validator — zero bookmakers game filtering", () => {
  it("rejects any pick against a game with empty bookmakers", () => {
    const game = makeGame({ bookmakers: [] });
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-180",
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("rejected");
    expect((result as { reason: string }).reason).toContain("not offered by any trusted book");
  });

  it("rejects any pick against a game with undefined bookmakers", () => {
    const game = makeGame({ bookmakers: undefined });
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-180",
      bookmaker: "DraftKings",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("rejected");
  });

  it("rejects pick when bookmaker is not in trusted set", () => {
    // Game has a bookmaker but it's not in TRUSTED_BOOKS
    const game = makeGame({
      bookmakers: [
        {
          key: "sketchy_book",
          title: "SketchyBook",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Boston Celtics", price: -180 },
                { name: "New York Knicks", price: 150 },
              ],
            },
          ],
        },
      ],
    });
    const pick: ValidatorPick = {
      game: "Boston Celtics vs New York Knicks",
      pick: "Boston Celtics",
      odds: "-180",
      bookmaker: "SketchyBook",
    };

    const result = validatePickAgainstPayload(pick, game, trusted);
    expect(result.status).toBe("rejected");
  });
});
