"""Generate Android mipmap icons from the 512x512 source icon."""
from PIL import Image
import os

src = os.path.join(os.path.dirname(__file__), '..', 'assets', 'app-icon-512.png')
res_dir = os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'src', 'main', 'res')

img = Image.open(src).convert('RGBA')

# Android mipmap sizes
sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

for folder, size in sizes.items():
    out_dir = os.path.join(res_dir, folder)
    os.makedirs(out_dir, exist_ok=True)

    resized = img.resize((size, size), Image.LANCZOS)

    # Save as PNG for both regular and round
    resized.save(os.path.join(out_dir, 'ic_launcher.png'), 'PNG')
    resized.save(os.path.join(out_dir, 'ic_launcher_round.png'), 'PNG')
    print(f"  {folder}: {size}x{size}")

print("\nAll mipmap icons generated!")
