"""Generate a 512x512 app icon for Family Shopping List - Shopping cart with checklist."""
from PIL import Image, ImageDraw
import math
import os

SIZE = 512
output_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'app-icon-512.png')
os.makedirs(os.path.dirname(output_path), exist_ok=True)

corner_radius = 100

# --- Background with gradient ---
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle(
    [(0, 0), (SIZE - 1, SIZE - 1)],
    radius=corner_radius,
    fill=(76, 175, 80)
)

gradient = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(gradient)
for y in range(SIZE):
    a = int(30 * (y / SIZE))
    gdraw.line([(0, y), (SIZE, y)], fill=(0, 0, 0, a))
img = Image.alpha_composite(img, gradient)
draw = ImageDraw.Draw(img)

white = (255, 255, 255, 245)
white_solid = (255, 255, 255)
cx = SIZE // 2

# --- Shopping cart ---
# Cart handle (top bar extending left)
handle_y = 145
handle_left = 85
handle_right = 160
draw.line([(handle_left, handle_y), (handle_right, handle_y)], fill=white, width=16)
# Round cap on left
draw.ellipse([(handle_left - 7, handle_y - 7), (handle_left + 7, handle_y + 7)], fill=white)

# Cart body - trapezoid shape (wider at top, narrower at bottom)
cart_top = 155
cart_bottom = 340
cart_left_top = 130
cart_right_top = 410
cart_left_bottom = 165
cart_right_bottom = 375

# Draw cart body as polygon
cart_points = [
    (cart_left_top, cart_top),
    (cart_right_top, cart_top),
    (cart_right_bottom, cart_bottom),
    (cart_left_bottom, cart_bottom),
]
draw.polygon(cart_points, fill=white)

# Round the bottom corners with circles
r = 20
draw.rounded_rectangle(
    [(cart_left_bottom - 5, cart_bottom - r), (cart_right_bottom + 5, cart_bottom + 5)],
    radius=r,
    fill=white
)
# Clean top edge
draw.rectangle(
    [(cart_left_top, cart_top), (cart_right_top, cart_top + 14)],
    fill=white
)

# Redraw as a cleaner rounded trapezoid
img2 = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw2 = ImageDraw.Draw(img2)

# Background
draw2.rounded_rectangle(
    [(0, 0), (SIZE - 1, SIZE - 1)],
    radius=corner_radius,
    fill=(76, 175, 80)
)
img2 = Image.alpha_composite(img2, gradient)
draw2 = ImageDraw.Draw(img2)

# --- Cart handle bar ---
draw2.line([(75, 148), (155, 148)], fill=white, width=18)
draw2.ellipse([(67, 140), (83, 156)], fill=white)  # round left end

# Diagonal from handle to cart top-left
draw2.line([(148, 148), (175, 170)], fill=white, width=18)

# --- Cart body (clean rounded trapezoid) ---
# Using a polygon + rounded bottom
body_pts = [
    (168, 170),   # top-left
    (415, 170),   # top-right
    (385, 345),   # bottom-right
    (198, 345),   # bottom-left
]
draw2.polygon(body_pts, fill=white)

# Round the bottom edge
draw2.rounded_rectangle(
    [(198, 320), (385, 355)],
    radius=18,
    fill=white
)
# Fill any gap at the top
draw2.rectangle([(168, 170), (415, 190)], fill=white)
# Round top-right corner slightly
draw2.ellipse([(400, 162), (425, 185)], fill=white)

# --- Wheels ---
wheel_y = 385
wheel_r = 22
# Left wheel
draw2.ellipse(
    [(215 - wheel_r, wheel_y - wheel_r), (215 + wheel_r, wheel_y + wheel_r)],
    fill=white
)
draw2.ellipse(
    [(215 - 9, wheel_y - 9), (215 + 9, wheel_y + 9)],
    fill=(56, 132, 58)
)
# Right wheel
draw2.ellipse(
    [(368 - wheel_r, wheel_y - wheel_r), (368 + wheel_r, wheel_y + wheel_r)],
    fill=white
)
draw2.ellipse(
    [(368 - 9, wheel_y - 9), (368 + 9, wheel_y + 9)],
    fill=(56, 132, 58)
)

# Legs from cart to wheels
draw2.line([(215, 345), (215, wheel_y - wheel_r)], fill=white, width=10)
draw2.line([(368, 345), (368, wheel_y - wheel_r)], fill=white, width=10)

# --- Checklist items inside cart ---
green_dark = (46, 125, 50)
green_mid = (56, 142, 60)
gray_line = (180, 180, 180, 200)
check_size = 26

items_x = 215
items = [
    {"y": 200, "checked": True},
    {"y": 245, "checked": True},
    {"y": 290, "checked": False},
]

for item in items:
    iy = item["y"]
    # Adjust x slightly per row (trapezoid)
    row_progress = (iy - 170) / (345 - 170)
    row_left = 168 + (198 - 168) * row_progress + 28
    row_right = 415 - (415 - 385) * row_progress - 28
    box_x = int(row_left)

    if item["checked"]:
        # Filled green checkbox
        draw2.rounded_rectangle(
            [(box_x, iy), (box_x + check_size, iy + check_size)],
            radius=5,
            fill=green_dark
        )
        # White checkmark
        draw2.line(
            [(box_x + 5, iy + 13), (box_x + 10, iy + 20)],
            fill=white_solid, width=4
        )
        draw2.line(
            [(box_x + 10, iy + 20), (box_x + 22, iy + 6)],
            fill=white_solid, width=4
        )
        # Gray strikethrough line (checked off)
        draw2.line(
            [(box_x + 38, iy + 13), (int(row_right), iy + 13)],
            fill=gray_line, width=7
        )
    else:
        # Empty checkbox outline
        draw2.rounded_rectangle(
            [(box_x, iy), (box_x + check_size, iy + check_size)],
            radius=5,
            outline=green_dark, width=3
        )
        # Dark text line (not checked)
        draw2.line(
            [(box_x + 38, iy + 13), (int(row_right), iy + 13)],
            fill=green_dark, width=7
        )

img2.save(output_path, 'PNG')
print(f"Icon saved to: {output_path}")
