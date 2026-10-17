# Render one page of a plan (PDF or image) to PNG, optionally cropped to a Gemini box.
# usage: python plan-crop.py <in> <out.png> [page] [ymin xmin ymax xmax  (0-1000, Gemini box_2d)]
import sys, pymupdf

src, out = sys.argv[1], sys.argv[2]
page = int(sys.argv[3]) if len(sys.argv) > 3 else 1
box = [float(v) for v in sys.argv[4:8]] if len(sys.argv) >= 8 else None

doc = pymupdf.open(src)
p = doc[min(max(page, 1), len(doc)) - 1]
r = p.rect
clip = r
if box:
    y0, x0, y1, x1 = box
    m = 0.12 * max(y1 - y0, x1 - x0)  # margin so dimension chains just outside the room stay in
    clip = pymupdf.Rect(r.x0 + r.width * max(0, x0 - m) / 1000, r.y0 + r.height * max(0, y0 - m) / 1000,
                        r.x0 + r.width * min(1000, x1 + m) / 1000, r.y0 + r.height * min(1000, y1 + m) / 1000)
# Long side ~3000 px: plenty for small dimension text, still one image for the API.
zoom = 3000 / max(clip.width, clip.height)
p.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip).save(out)
print(len(doc))
