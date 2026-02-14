"""Generate a 1024x500 feature graphic for Google Play Store."""
from PIL import Image, ImageDraw, ImageFont
import os

WIDTH = 1024
HEIGHT = 500
output_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'feature-graphic.png')

img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Green gradient background
for y in range(HEIGHT):
    progress = y / HEIGHT
    r = int(85 - 30 * progress)
    g = int(195 - 50 * progress)
    b = int(90 - 30 * progress)
    draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))

# Subtle radial glow in center-left area
glow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
cx_glow, cy_glow = WIDTH // 3, HEIGHT // 2
for radius in range(300, 0, -1):
    alpha = int(25 * (1 - radius / 300))
    glow_draw.ellipse(
        [(cx_glow - radius, cy_glow - radius), (cx_glow + radius, cy_glow + radius)],
        fill=(255, 255, 255, alpha)
    )
img = Image.alpha_composite(img, glow)
draw = ImageDraw.Draw(img)

# Load app icon and place on the right side
icon_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'app-icon-512.png')
if os.path.exists(icon_path):
    icon = Image.open(icon_path).convert('RGBA')
    icon_size = 280
    icon = icon.resize((icon_size, icon_size), Image.LANCZOS)

    # Add subtle shadow behind icon
    shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    icon_x = WIDTH - icon_size - 100
    icon_y = (HEIGHT - icon_size) // 2
    shadow_draw.rounded_rectangle(
        [(icon_x + 6, icon_y + 6), (icon_x + icon_size + 6, icon_y + icon_size + 6)],
        radius=55,
        fill=(0, 0, 0, 40)
    )
    img = Image.alpha_composite(img, shadow)
    draw = ImageDraw.Draw(img)

    img.paste(icon, (icon_x, icon_y), icon)

# Text on the left side
# Try to load a nice font, fall back to default
text_x = 80
white = (255, 255, 255)
white_sub = (255, 255, 255, 220)

# Try common Windows fonts
font_title = None
font_subtitle = None
font_tagline = None

font_paths = [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
]
font_bold_paths = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]
font_light_paths = [
    "C:/Windows/Fonts/segoeuil.ttf",
    "C:/Windows/Fonts/calibril.ttf",
    "C:/Windows/Fonts/arial.ttf",
]

for fp in font_bold_paths:
    if os.path.exists(fp):
        font_title = ImageFont.truetype(fp, 62)
        break

for fp in font_paths:
    if os.path.exists(fp):
        font_subtitle = ImageFont.truetype(fp, 30)
        break

for fp in font_light_paths:
    if os.path.exists(fp):
        font_tagline = ImageFont.truetype(fp, 24)
        break

if not font_title:
    font_title = ImageFont.load_default()
if not font_subtitle:
    font_subtitle = ImageFont.load_default()
if not font_tagline:
    font_tagline = ImageFont.load_default()

# App name
title_y = 130
draw.text((text_x, title_y), "Family", fill=white, font=font_title)
title_w = draw.textlength("Family", font=font_title)
draw.text((text_x, title_y + 70), "Shopping List", fill=white, font=font_title)

# Divider line
line_y = title_y + 160
draw.line([(text_x, line_y), (text_x + 80, line_y)], fill=(255, 255, 255, 180), width=3)

# Tagline
draw.text(
    (text_x, line_y + 20),
    "Shop together. Stay organized.",
    fill=white_sub,
    font=font_subtitle
)

# Sub-tagline
draw.text(
    (text_x, line_y + 60),
    "Real-time sync  |  Budget tracking  |  Family groups",
    fill=(255, 255, 255, 160),
    font=font_tagline
)

img.save(output_path, 'PNG')
print(f"Feature graphic saved to: {output_path}")
