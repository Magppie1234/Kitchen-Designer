# Accessories Master Data

Extracted from **Accessories List with Zone and Wall Details.xlsx** (source: `D:\02 TOD Tech Supporting Docs\`).
Dependency-free extraction of every sheet to CSV + JSON, plus all embedded product photos.

## Contents
- `accessories-master.json` — every sheet as a 2-D array, keyed by sheet name.
- `csv/` — one CSV per sheet (see table below).
- `media/` — 25 embedded product images (`image1.jpg` … ).
- `manifest.json` — sheet metadata + `imageRowMap` (row → image on the Kitchen Accessories sheet).

## Sheets
| # | Sheet | State | Rows | CSV |
|---|-------|-------|------|-----|
| 1 | Kitchen Accessories | visible | 42 | [`csv/01_Kitchen Accessories.csv`](csv/01_Kitchen%20Accessories.csv) |
| 2 | Copy of Kitchen Modules | hidden | 37 | [`csv/02_Copy of Kitchen Modules.csv`](csv/02_Copy%20of%20Kitchen%20Modules.csv) |
| 3 | Shutters | hidden | 21 | [`csv/03_Shutters.csv`](csv/03_Shutters.csv) |
| 4 | Shutter Parts Detail | hidden | 41 | [`csv/04_Shutter Parts Detail.csv`](csv/04_Shutter%20Parts%20Detail.csv) |
| 5 | Copy of Cabinet price | hidden | 89 | [`csv/05_Copy of Cabinet price.csv`](csv/05_Copy%20of%20Cabinet%20price.csv) |
| 6 | Copy of Kitchen Modules (1) | hidden | 37 | [`csv/06_Copy of Kitchen Modules (1).csv`](csv/06_Copy%20of%20Kitchen%20Modules%20(1).csv) |
| 7 | Shutters (1) | hidden | 21 | [`csv/07_Shutters (1).csv`](csv/07_Shutters%20(1).csv) |
| 8 | Shutter Parts Detail (1) | hidden | 41 | [`csv/08_Shutter Parts Detail (1).csv`](csv/08_Shutter%20Parts%20Detail%20(1).csv) |
| 9 | Copy of Cabinet price (1) | hidden | 89 | [`csv/09_Copy of Cabinet price (1).csv`](csv/09_Copy%20of%20Cabinet%20price%20(1).csv) |
| 10 | Copy of Kitchen Modules (2) | hidden | 37 | [`csv/10_Copy of Kitchen Modules (2).csv`](csv/10_Copy%20of%20Kitchen%20Modules%20(2).csv) |
| 11 | Shutters (2) | hidden | 21 | [`csv/11_Shutters (2).csv`](csv/11_Shutters%20(2).csv) |
| 12 | Shutter Parts Detail (2) | hidden | 41 | [`csv/12_Shutter Parts Detail (2).csv`](csv/12_Shutter%20Parts%20Detail%20(2).csv) |

## Kitchen Accessories sheet (the primary, only *visible* tab)
Header row (row 2 of the CSV): **S.NO · CATEGORY · PRODUCT NAME · PRODUCT IMAGE · SIZE (mm) · PRICE (Rs) · Accessory Position · Cooking Zone (Hob) · Washing Zone (Sink) · Cooling Zone (Ref) · Island · Other Wall**.
The PRODUCT IMAGE column has been back-filled with the anchored photo path (`media/imageNN.jpg`).
"Accessory Position" carries the drawer/unit type (e.g. *Low back Drawer*, *High back Drawer*, *Sink Cabinet*, *PULLOUT UNIT*, *Blind Cabinet*) and the zone columns mark applicability (Yes/No).

> The 11 hidden tabs (Kitchen Modules / Shutters / Shutter Parts / Cabinet price, in triplicate) are duplicate module/pricing tables kept for completeness.
