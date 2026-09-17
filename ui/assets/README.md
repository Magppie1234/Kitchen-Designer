# Accessory photos

The Design-phase **Accessories** step shows a real product photo for each option.
Save the two images here with these exact names (JPEG):

| File                     | Shown for      | The image you provided |
|--------------------------|----------------|------------------------|
| `public/assets/kubos.jpg`| **KUBOS** tile | the black-framed glass display niche (first image) |
| `public/assets/tark.jpg` | **Tark System**| "THE WELLNESS KITCHEN" gold display shelving (second image) |

They're served at `/assets/kubos.jpg` and `/assets/tark.jpg` by `scripts/builder-server.mjs`.
`.jpg`, `.png` and `.webp` are all supported (update the `img:` path in `data`→`STEPS`→`acc`
in `public/builder.html` if you change the extension). Until a file exists, the tile falls back
to its original gradient placeholder — no broken image.
