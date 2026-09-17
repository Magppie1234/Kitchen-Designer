# Appliances Master Data (the "2nd Excel sheet")

Extracted from **Appliances List with Zone Details.xlsx** (source: `D:\02 TOD Tech Supporting Docs\`).
This is the file referred to as the **"2nd Excel"** going forward (the accessories file in
`data/accessories-master/` is the "previous / 1st Excel").

## Contents
- `appliances-master.json` — every sheet as a 2-D array, keyed by sheet name.
- `csv/` — one CSV per sheet.
- `media/` — 23 embedded product images.
- `manifest.json` — sheet metadata + `imageRowMap`.

## Primary tab: "Kitchen Appliances" (the only visible tab)
Columns: **Serial no. · Zoning · Appliances · Product Image · Size (mm)/Cabinet Width · Type**.
23 appliances (Sr 1–23).

> ⚠️ Image-anchor offset: in this sheet the product photos are anchored one row above their row,
> so the raw `Product Image` cell can be off by one. The serials used by the app were **visually
> verified**: **Sr 1 = Refrigerator Free standing → image1.png**, **Sr 2 = Refrigerator Built-In →
> image2.png**, **Sr 4 = Hob → image4.png**. The other 11 tabs are hidden duplicate module/price tables.
