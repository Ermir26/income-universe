import Replicate from "replicate";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Shared character description = consistent shark across all 6 images
const SHARK_CHARACTER =
  "a muscular anthropomorphic great white shark with steel-grey skin, " +
  "piercing blue eyes, sharp white teeth in a confident grin, athletic build, " +
  "photorealistic, ultra-detailed scales, cinematic lighting";

const SPORTS = [
  {
    name: "soccer",
    prompt: `${SHARK_CHARACTER}, wearing a red soccer jersey and white shorts, ` +
      `mid-bicycle-kick scoring a goal, soccer ball blasting into the top corner of the net, ` +
      `floodlit stadium at night, motion blur, shot on Sony A1 with 200mm f/2.8 lens, ` +
      `sports photography, dramatic action shot, 8k`,
  },
  {
    name: "football",
    prompt: `${SHARK_CHARACTER}, wearing a navy blue NFL-style helmet and shoulder pads, ` +
      `diving into the end zone with the football extended over the goal line for a touchdown, ` +
      `grass and chalk dust flying, packed stadium blurred behind, golden hour lighting, ` +
      `shot on Canon R5 with 400mm lens, ESPN-style sports photography, ultra-realistic, 8k`,
  },
  {
    name: "baseball",
    prompt: `${SHARK_CHARACTER}, wearing a white pinstripe baseball uniform and batting helmet, ` +
      `swinging a wooden bat connecting with the baseball at home plate, dirt kicking up, ` +
      `baseball compressing on impact, stadium lights, dusk sky, ` +
      `shot on Nikon Z9 with 300mm f/2.8, MLB-style action photography, photorealistic, 8k`,
  },
  {
    name: "basketball",
    prompt: `${SHARK_CHARACTER}, wearing a yellow basketball jersey and shorts, ` +
      `mid-slam-dunk hanging off the rim with one fin, basketball going through the net, ` +
      `arena crowd blurred behind, dramatic spotlights, sweat droplets in the air, ` +
      `low-angle shot, shot on Sony A1 with 70-200mm lens, NBA-style photography, ultra-realistic, 8k`,
  },
  {
    name: "tennis",
    prompt: `${SHARK_CHARACTER}, wearing a white tennis shirt and shorts, ` +
      `mid-serve with racket striking the tennis ball at full extension, ball compressing on impact, ` +
      `orange clay court, Roland Garros-style stadium blurred behind, sunny afternoon, ` +
      `shot on Canon R3 with 600mm lens, sports photography, photorealistic, 8k`,
  },
  {
    name: "mma",
    prompt: `${SHARK_CHARACTER}, wearing black MMA fight shorts and fingerless gloves, ` +
      `landing a powerful knockout punch on opponent inside an octagon cage, sweat and impact spray flying, ` +
      `crowd blurred in darkness behind, dramatic overhead spotlights, ` +
      `shot on Sony A1 with 85mm f/1.4, UFC-style fight photography, ultra-realistic, cinematic, 8k`,
  },
];

const OUTPUT_DIR = path.join(process.cwd(), "public", "sharks");

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      fs.unlink(filepath, () => reject(err));
    });
  });
}

async function generateAll() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const sport of SPORTS) {
    console.log(`\n🦈 Generating ${sport.name}...`);

    try {
      const output = await replicate.run(
        "black-forest-labs/flux-1.1-pro-ultra",
        {
          input: {
            prompt: sport.prompt,
            aspect_ratio: "16:9",
            output_format: "jpg",
            safety_tolerance: 2,
            raw: false,
          },
        }
      );

      const imageUrl = typeof output === "string" ? output : output.url();
      const filepath = path.join(OUTPUT_DIR, `${sport.name}.jpg`);
      await downloadImage(imageUrl, filepath);

      console.log(`✅ Saved /public/sharks/${sport.name}.jpg`);
    } catch (err) {
      console.error(`❌ ${sport.name} failed:`, err.message);
    }
  }

  console.log("\n🎉 Done! All sharks saved to /public/sharks/");
}

generateAll();
