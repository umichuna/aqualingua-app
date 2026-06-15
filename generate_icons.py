"""PWAアイコン生成スクリプト"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size):
    img = Image.new("RGBA", (size, size), (7, 26, 51, 255))  # #071A33
    draw = ImageDraw.Draw(img)

    # 海のグラデーション風の背景円
    margin = size // 10
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(11, 46, 83, 255),  # #0B2E53
    )

    # 魚の絵文字をテキストで描く
    fish = "🐠"
    font_size = size // 2
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/seguiemj.ttf", font_size)
    except Exception:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", font_size)
            fish = "AL"
        except Exception:
            font = ImageFont.load_default()
            fish = "AL"

    bbox = draw.textbbox((0, 0), fish, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    draw.text((x, y), fish, font=font, fill=(255, 255, 255, 255))

    return img

os.makedirs("public/icons", exist_ok=True)

for s in [192, 512]:
    icon = create_icon(s)
    path = f"public/icons/icon-{s}.png"
    icon.save(path)
    print(f"OK: {path}")

print("Done")
