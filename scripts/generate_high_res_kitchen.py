import os
import shutil
from PIL import Image, ImageDraw

def hex_to_rgba(h, alpha=255):
    h = h.lstrip('#')
    if len(h) == 6:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)
    elif len(h) == 8:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16))
    return (0, 0, 0, alpha)

def create_fridge():
    # 32x32 high-resolution French Door Refrigerator with ice dispenser & magnets
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Outer stainless steel body
    d.rectangle([1, 1, 30, 31], fill=hex_to_rgba("#cbd5e1"))
    d.rectangle([0, 2, 31, 30], fill=hex_to_rgba("#cbd5e1"))
    
    # Left highlight & right shadow
    d.line([1, 2, 1, 30], fill=hex_to_rgba("#f1f5f9"))
    d.line([30, 2, 30, 30], fill=hex_to_rgba("#94a3b8"))
    d.line([31, 3, 31, 29], fill=hex_to_rgba("#64748b"))
    
    # Top freezer section (rows 2..11)
    d.rectangle([2, 2, 29, 11], fill=hex_to_rgba("#e2e8f0"))
    d.line([2, 2, 29, 2], fill=hex_to_rgba("#ffffff"))
    d.line([2, 11, 29, 11], fill=hex_to_rgba("#64748b")) # Freezer seam
    # Freezer horizontal handle
    d.rectangle([8, 8, 23, 9], fill=hex_to_rgba("#475569"))
    d.line([8, 8, 23, 8], fill=hex_to_rgba("#94a3b8"))
    
    # Middle / Lower French doors divider (column 15-16)
    d.rectangle([2, 12, 15, 30], fill=hex_to_rgba("#e2e8f0"))
    d.rectangle([16, 12, 29, 30], fill=hex_to_rgba("#cbd5e1"))
    d.line([15, 12, 15, 30], fill=hex_to_rgba("#64748b")) # Center gap
    d.line([16, 12, 16, 30], fill=hex_to_rgba("#334155"))
    
    # Left Door: Water / Ice Dispenser (rows 14..22, cols 4..11)
    d.rectangle([4, 14, 11, 22], fill=hex_to_rgba("#1e293b"))
    d.rectangle([5, 15, 10, 21], fill=hex_to_rgba("#0f172a"))
    # Digital LED display (cyan)
    d.line([6, 16, 9, 16], fill=hex_to_rgba("#38bdf8"))
    d.point([7, 17], fill=hex_to_rgba("#0284c7"))
    # Dispenser lever & cup cradle
    d.line([7, 19, 8, 19], fill=hex_to_rgba("#64748b"))
    d.line([6, 21, 9, 21], fill=hex_to_rgba("#475569"))
    
    # Right Door: Cute pixel magnets!
    # Magnet 1: Yellow sticky note (col 20..25, row 14..18)
    d.rectangle([20, 14, 25, 18], fill=hex_to_rgba("#fef08a"))
    d.line([21, 15, 24, 15], fill=hex_to_rgba("#ca8a04"))
    d.line([21, 16, 23, 16], fill=hex_to_rgba("#ca8a04"))
    d.point([22, 14], fill=hex_to_rgba("#ef4444")) # Red pushpin
    
    # Magnet 2: Red strawberry / heart magnet
    d.rectangle([22, 22, 24, 24], fill=hex_to_rgba("#ef4444"))
    d.point([23, 21], fill=hex_to_rgba("#22c55e")) # Green stem
    
    # Vertical door handles (cols 13-14 on left door, 17-18 on right door)
    d.rectangle([13, 14, 14, 27], fill=hex_to_rgba("#64748b"))
    d.line([13, 14, 13, 27], fill=hex_to_rgba("#94a3b8"))
    d.rectangle([17, 14, 18, 27], fill=hex_to_rgba("#64748b"))
    d.line([17, 14, 17, 27], fill=hex_to_rgba("#94a3b8"))
    
    # Bottom kickplate / vents (row 31)
    d.line([2, 31, 29, 31], fill=hex_to_rgba("#334155"))
    for c in range(4, 28, 3):
        d.point([c, 31], fill=hex_to_rgba("#1e293b"))
        
    return img

def create_stovetop():
    # 64x32 Stovetop & Oven (2 tiles wide, high resolution)
    img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Countertop base (rows 0..31, cols 0..63)
    d.rectangle([0, 0, 63, 31], fill=hex_to_rgba("#1e293b")) # Stainless chassis
    d.line([0, 0, 63, 0], fill=hex_to_rgba("#94a3b8")) # Top bevel highlight
    d.line([0, 31, 63, 31], fill=hex_to_rgba("#0f172a")) # Bottom shadow
    
    # Top Surface: Brushed stainless cooktop (rows 1..13)
    d.rectangle([2, 1, 61, 13], fill=hex_to_rgba("#334155"))
    d.line([2, 1, 61, 1], fill=hex_to_rgba("#475569"))
    
    # 4 Cast Iron Burners with detailed grates
    burners = [(10, 4), (24, 4), (39, 4), (53, 4)]
    for bx, by in burners:
        # Burner well (dark recess)
        d.ellipse([bx-6, by-2, bx+6, by+7], fill=hex_to_rgba("#0f172a"))
        # Simmer glow (electric/gas blue flame ring)
        d.ellipse([bx-4, by, bx+4, by+5], outline=hex_to_rgba("#0284c7"))
        d.ellipse([bx-3, by+1, bx+3, by+4], outline=hex_to_rgba("#38bdf8"))
        # Cast iron grate cross & center cap
        d.line([bx-5, by+3, bx+5, by+3], fill=hex_to_rgba("#475569"))
        d.line([bx, by-1, bx, by+6], fill=hex_to_rgba("#475569"))
        d.point([bx, by+3], fill=hex_to_rgba("#94a3b8"))
    
    # Control Panel (rows 14..18)
    d.rectangle([2, 14, 61, 18], fill=hex_to_rgba("#475569"))
    d.line([2, 14, 61, 14], fill=hex_to_rgba("#64748b"))
    # Knobs with indicator marks
    knob_xs = [8, 16, 24, 32, 40, 48, 56]
    for kx in knob_xs:
        d.rectangle([kx-1, 15, kx+1, 17], fill=hex_to_rgba("#cbd5e1"))
        d.point([kx, 15], fill=hex_to_rgba("#ef4444")) # Red heat indicator
        d.point([kx, 17], fill=hex_to_rgba("#334155"))
        
    # Oven Door (rows 19..30)
    d.rectangle([4, 19, 59, 30], fill=hex_to_rgba("#1e293b"))
    # Oven Handle
    d.rectangle([12, 19, 51, 20], fill=hex_to_rgba("#cbd5e1"))
    d.line([12, 19, 51, 19], fill=hex_to_rgba("#f8fafc"))
    
    # Glass viewing window (rows 22..29, cols 10..53)
    d.rectangle([10, 22, 53, 29], fill=hex_to_rgba("#020617"))
    # Warm interior illumination & baking rack
    d.line([12, 25, 51, 25], fill=hex_to_rgba("#ca8a04"))
    d.line([12, 26, 51, 26], fill=hex_to_rgba("#eab308"))
    for rx in range(14, 50, 4):
        d.point([rx, 25], fill=hex_to_rgba("#fef08a"))
        
    return img

def create_sink_unit():
    # 64x32 Kitchen Sink & Cabinet Unit (2 tiles wide)
    img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Countertop (White Quartz with subtle marbling, rows 0..11)
    d.rectangle([0, 0, 63, 11], fill=hex_to_rgba("#f8fafc"))
    d.line([0, 0, 63, 0], fill=hex_to_rgba("#ffffff"))
    # Subtle quartz marble veins
    d.line([4, 2, 12, 5], fill=hex_to_rgba("#e2e8f0"))
    d.line([52, 2, 59, 6], fill=hex_to_rgba("#e2e8f0"))
    d.line([0, 11, 63, 11], fill=hex_to_rgba("#94a3b8")) # Counter rim shadow
    
    # Undermount Stainless Steel Double Basin Sink (cols 14..49, rows 2..10)
    d.rectangle([14, 2, 49, 10], fill=hex_to_rgba("#64748b")) # Outer rim
    d.rectangle([15, 3, 30, 9], fill=hex_to_rgba("#334155")) # Left basin
    d.rectangle([33, 3, 48, 9], fill=hex_to_rgba("#334155")) # Right basin
    # Basin water reflections & strainers
    d.line([16, 4, 29, 4], fill=hex_to_rgba("#475569"))
    d.line([34, 4, 47, 4], fill=hex_to_rgba("#475569"))
    d.ellipse([21, 6, 24, 8], fill=hex_to_rgba("#94a3b8")) # Left drain
    d.ellipse([39, 6, 42, 8], fill=hex_to_rgba("#94a3b8")) # Right drain
    
    # High-Arc Chrome Gooseneck Faucet (at center col 31-32, extending up rows 0..6)
    d.rectangle([31, 1, 32, 6], fill=hex_to_rgba("#cbd5e1"))
    d.line([31, 0, 32, 0], fill=hex_to_rgba("#ffffff"))
    d.point([30, 1], fill=hex_to_rgba("#ffffff")) # Spout curve
    d.point([30, 2], fill=hex_to_rgba("#94a3b8"))
    # Dual handles
    d.point([29, 4], fill=hex_to_rgba("#cbd5e1"))
    d.point([34, 4], fill=hex_to_rgba("#cbd5e1"))
    
    # Glass Soap Dispenser (col 52..55, rows 4..9)
    d.rectangle([52, 5, 55, 9], fill=hex_to_rgba("#86efac")) # Green eco-soap
    d.line([53, 3, 54, 4], fill=hex_to_rgba("#cbd5e1")) # Pump
    
    # Lower Cabinets (Navy / Modern Slate, rows 12..31)
    d.rectangle([0, 12, 63, 30], fill=hex_to_rgba("#1e293b"))
    # Cabinet door dividers
    d.line([16, 12, 16, 30], fill=hex_to_rgba("#0f172a"))
    d.line([32, 12, 32, 30], fill=hex_to_rgba("#0f172a"))
    d.line([48, 12, 48, 30], fill=hex_to_rgba("#0f172a"))
    # Sleek brass bar handles
    handles = [(8, 16), (24, 16), (40, 16), (56, 16)]
    for hx, hy in handles:
        d.rectangle([hx-2, hy, hx+2, hy+1], fill=hex_to_rgba("#fbbf24"))
        d.point([hx-2, hy], fill=hex_to_rgba("#fef08a"))
        
    d.line([0, 31, 63, 31], fill=hex_to_rgba("#020617")) # Kickplate
    return img

def create_prep_unit():
    # 32x32 Prep Counter with Butcher Block, Knife & Spices
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Butcher block surface (rows 0..11)
    d.rectangle([0, 0, 31, 11], fill=hex_to_rgba("#d97706"))
    d.line([0, 0, 31, 0], fill=hex_to_rgba("#f59e0b"))
    # Wood grain lines
    for r in range(2, 11, 3):
        d.line([0, r, 31, r], fill=hex_to_rgba("#b45309"))
    d.line([0, 11, 31, 11], fill=hex_to_rgba("#78350f"))
    
    # Cutting board (cols 4..18, rows 2..8)
    d.rectangle([4, 2, 18, 8], fill=hex_to_rgba("#fde68a"))
    d.rectangle([5, 3, 17, 7], fill=hex_to_rgba("#fef3c7"))
    # Sliced vegetables / lime
    d.ellipse([7, 4, 10, 6], fill=hex_to_rgba("#84cc16"))
    d.ellipse([12, 4, 15, 6], fill=hex_to_rgba("#ef4444")) # Tomato slice
    
    # Chef knife resting (cols 20..29, row 5..6)
    d.line([20, 5, 26, 5], fill=hex_to_rgba("#e2e8f0")) # Steel blade
    d.line([27, 5, 29, 5], fill=hex_to_rgba("#451a03")) # Rosewood handle
    
    # Spice jars along back edge (cols 22..29, rows 1..3)
    d.rectangle([22, 1, 24, 3], fill=hex_to_rgba("#f97316")) # Paprika
    d.rectangle([26, 1, 28, 3], fill=hex_to_rgba("#10b981")) # Oregano
    
    # Lower Cabinet (rows 12..31)
    d.rectangle([0, 12, 31, 30], fill=hex_to_rgba("#1e293b"))
    d.line([16, 12, 16, 30], fill=hex_to_rgba("#0f172a")) # Door split
    # Brass pulls
    d.rectangle([13, 16, 14, 20], fill=hex_to_rgba("#fbbf24"))
    d.rectangle([17, 16, 18, 20], fill=hex_to_rgba("#fbbf24"))
    d.line([0, 31, 31, 31], fill=hex_to_rgba("#020617"))
    return img

def create_microwave():
    # 32x32 Microwave on Countertop
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Countertop base (rows 20..31)
    d.rectangle([0, 20, 31, 23], fill=hex_to_rgba("#f8fafc"))
    d.line([0, 20, 31, 20], fill=hex_to_rgba("#ffffff"))
    d.rectangle([0, 24, 31, 31], fill=hex_to_rgba("#1e293b"))
    
    # Microwave Unit (rows 2..19, cols 2..29)
    d.rectangle([2, 2, 29, 19], fill=hex_to_rgba("#334155")) # Chassis
    d.line([2, 2, 29, 2], fill=hex_to_rgba("#64748b")) # Top highlight
    d.line([29, 2, 29, 19], fill=hex_to_rgba("#1e293b")) # Side shadow
    
    # Tinted glass door (cols 4..21, rows 4..17)
    d.rectangle([4, 4, 21, 17], fill=hex_to_rgba("#0f172a"))
    # Glass reflection streak
    d.line([6, 5, 12, 16], fill=hex_to_rgba("#1e293b"))
    # Interior turntable with warm soup bowl
    d.ellipse([9, 13, 17, 16], fill=hex_to_rgba("#fef08a"))
    d.point([13, 12], fill=hex_to_rgba("#ea580c"))
    
    # Control Panel (cols 22..27, rows 4..17)
    d.rectangle([22, 4, 27, 17], fill=hex_to_rgba("#1e293b"))
    # Green LED Digital Clock (12:00)
    d.line([23, 6, 26, 6], fill=hex_to_rgba("#22c55e"))
    d.point([24, 7], fill=hex_to_rgba("#15803d"))
    # Keypad matrix
    for py in [9, 11, 13]:
        d.line([23, py, 26, py], fill=hex_to_rgba("#64748b"))
    # Silver start button (blue/green)
    d.rectangle([23, 15, 26, 16], fill=hex_to_rgba("#38bdf8"))
    
    # Door Handle (col 20, rows 6..15)
    d.line([20, 6, 20, 15], fill=hex_to_rgba("#cbd5e1"))
    return img

def create_espresso():
    # 32x32 Commercial Italian Espresso Machine on Counter
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Countertop (rows 22..31)
    d.rectangle([0, 22, 31, 24], fill=hex_to_rgba("#f8fafc"))
    d.rectangle([0, 25, 31, 31], fill=hex_to_rgba("#1e293b"))
    
    # Espresso Machine Chassis (cols 3..28, rows 3..21)
    d.rectangle([3, 3, 28, 21], fill=hex_to_rgba("#94a3b8")) # Brushed steel
    d.line([3, 3, 28, 3], fill=hex_to_rgba("#ffffff"))
    
    # Top Cup Warmer Rail & Ceramic Cups (rows 0..5, cols 5..26)
    d.line([5, 3, 26, 3], fill=hex_to_rgba("#cbd5e1")) # Rail
    # White ceramic cup
    d.rectangle([7, 1, 11, 3], fill=hex_to_rgba("#f8fafc"))
    d.point([6, 2], fill=hex_to_rgba("#cbd5e1")) # Handle
    # Terracotta cup
    d.rectangle([14, 1, 18, 3], fill=hex_to_rgba("#ea580c"))
    # Stacked cups
    d.rectangle([21, 1, 25, 3], fill=hex_to_rgba("#38bdf8"))
    
    # Dual Circular Pressure Gauges (cols 6..10, 21..25, row 6..9)
    d.ellipse([6, 6, 10, 9], fill=hex_to_rgba("#fef08a")) # Brass bezel
    d.point([8, 8], fill=hex_to_rgba("#dc2626")) # Gauge needle
    d.ellipse([21, 6, 25, 9], fill=hex_to_rgba("#fef08a"))
    d.point([23, 7], fill=hex_to_rgba("#0284c7"))
    
    # Center Grouphead & Portafilter (cols 12..19, rows 10..18)
    d.rectangle([13, 10, 18, 12], fill=hex_to_rgba("#e2e8f0")) # Chrome group
    d.rectangle([14, 13, 17, 14], fill=hex_to_rgba("#64748b")) # Portafilter basket
    d.line([18, 13, 23, 15], fill=hex_to_rgba("#451a03")) # Angled wood handle
    
    # Steam Wand (left side, cols 4..7, rows 10..19)
    d.line([5, 10, 5, 16], fill=hex_to_rgba("#e2e8f0"))
    d.line([5, 16, 7, 18], fill=hex_to_rgba("#cbd5e1"))
    
    # Perforated Stainless Drip Tray (rows 19..21, cols 4..27)
    d.rectangle([4, 19, 27, 21], fill=hex_to_rgba("#475569"))
    for gx in range(6, 26, 3):
        d.point([gx, 20], fill=hex_to_rgba("#1e293b"))
        
    # Espresso Cup catching fresh shot!
    d.rectangle([14, 17, 17, 19], fill=hex_to_rgba("#ffffff"))
    d.point([15, 17], fill=hex_to_rgba("#78350f")) # Rich crema
    d.point([16, 17], fill=hex_to_rgba("#d97706"))
    return img

def create_tea():
    # 32x32 Artisan Tea Station on Counter
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Wooden Serving Tray Base (rows 19..22, cols 2..29)
    d.rectangle([0, 22, 31, 24], fill=hex_to_rgba("#f8fafc")) # Countertop
    d.rectangle([0, 25, 31, 31], fill=hex_to_rgba("#1e293b"))
    d.rectangle([2, 19, 29, 21], fill=hex_to_rgba("#92400e")) # Teak tray
    d.line([2, 19, 29, 19], fill=hex_to_rgba("#b45309"))
    
    # Cast Iron Japanese Tetsubin Teapot (cols 4..14, rows 7..18)
    d.ellipse([5, 10, 13, 18], fill=hex_to_rgba("#1e293b")) # Iron pot
    d.line([3, 12, 5, 14], fill=hex_to_rgba("#334155")) # Spout
    d.arc([5, 5, 13, 14], 180, 0, fill=hex_to_rgba("#475569")) # Arched handle
    # Gold dot texture on pot
    for px, py in [(7, 12), (9, 13), (11, 12), (8, 15), (10, 16)]:
        d.point([px, py], fill=hex_to_rgba("#fbbf24"))
        
    # Glass Infuser Teapot (cols 16..24, rows 9..18)
    d.ellipse([16, 11, 24, 18], fill=hex_to_rgba("#d97706", 180)) # Amber brewed tea
    d.arc([16, 11, 24, 18], 0, 360, fill=hex_to_rgba("#ffffff", 220)) # Glass shine
    d.line([25, 13, 27, 14], fill=hex_to_rgba("#ffffff", 180)) # Spout
    d.line([19, 10, 21, 10], fill=hex_to_rgba("#64748b")) # Lid knob
    
    # Bamboo Matcha Whisk (Chasen) on green ceramic holder (cols 25..29, rows 12..18)
    d.rectangle([26, 15, 28, 18], fill=hex_to_rgba("#15803d")) # Holder
    d.line([27, 11, 27, 14], fill=hex_to_rgba("#fef08a")) # Whisk handle
    d.line([26, 12, 28, 14], fill=hex_to_rgba("#fef08a"))
    
    # Steam wisps!
    d.point([8, 3], fill=hex_to_rgba("#ffffff", 140))
    d.point([9, 4], fill=hex_to_rgba("#ffffff", 180))
    d.point([20, 6], fill=hex_to_rgba("#ffffff", 140))
    d.point([21, 7], fill=hex_to_rgba("#ffffff", 180))
    return img

def create_snack_bar():
    # 32x32 Gourmet Snack Bar with Pastries & Fruit Basket
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Counter base (rows 22..31)
    d.rectangle([0, 22, 31, 24], fill=hex_to_rgba("#f8fafc"))
    d.rectangle([0, 25, 31, 31], fill=hex_to_rgba("#1e293b"))
    
    # Tiered Glass Display Stand (cols 2..20, rows 6..21)
    d.line([11, 6, 11, 21], fill=hex_to_rgba("#cbd5e1")) # Center chrome pillar
    d.line([4, 14, 18, 14], fill=hex_to_rgba("#ffffff", 200)) # Top tier
    d.line([2, 20, 20, 20], fill=hex_to_rgba("#ffffff", 200)) # Bottom tier
    
    # Top Tier: Golden Croissants
    d.arc([6, 9, 11, 13], 160, 360, fill=hex_to_rgba("#d97706"))
    d.arc([7, 8, 10, 12], 160, 360, fill=hex_to_rgba("#fbbf24")) # Flaky crust
    d.arc([13, 9, 18, 13], 160, 360, fill=hex_to_rgba("#d97706"))
    d.arc([14, 8, 17, 12], 160, 360, fill=hex_to_rgba("#fbbf24"))
    
    # Bottom Tier: Frosted Donuts with Rainbow Sprinkles!
    # Donut 1: Pink strawberry glazed
    d.ellipse([4, 15, 10, 19], fill=hex_to_rgba("#f43f5e"))
    d.ellipse([6, 16, 8, 18], fill=hex_to_rgba("#ffffff", 200)) # Hole
    d.point([5, 16], fill=hex_to_rgba("#38bdf8")) # Blue sprinkle
    d.point([8, 17], fill=hex_to_rgba("#facc15")) # Yellow sprinkle
    # Donut 2: Chocolate frosted
    d.ellipse([12, 15, 18, 19], fill=hex_to_rgba("#451a03"))
    d.ellipse([14, 16, 16, 18], fill=hex_to_rgba("#ffffff", 200))
    d.point([13, 16], fill=hex_to_rgba("#ec4899")) # Pink sprinkle
    d.point([16, 16], fill=hex_to_rgba("#22c55e")) # Green sprinkle
    
    # Woven Fruit Basket (cols 21..30, rows 12..21)
    d.ellipse([21, 16, 30, 21], fill=hex_to_rgba("#b45309")) # Basket
    d.ellipse([22, 17, 29, 20], fill=hex_to_rgba("#78350f"))
    # Fresh Red Apples
    d.ellipse([22, 13, 26, 17], fill=hex_to_rgba("#ef4444"))
    d.point([24, 12], fill=hex_to_rgba("#15803d")) # Stem
    d.ellipse([25, 14, 29, 18], fill=hex_to_rgba("#dc2626"))
    # Yellow Banana
    d.arc([22, 11, 28, 18], 45, 150, fill=hex_to_rgba("#eab308"))
    
    return img

def main():
    generators = {
        'KITCHEN_FRIDGE': create_fridge,
        'KITCHEN_STOVETOP': create_stovetop,
        'KITCHEN_UNIT': create_sink_unit,
        'KITCHEN_PREP_UNIT': create_prep_unit,
        'MICROWAVE': create_microwave,
        'COFFEE_MACHINE': create_espresso,
        'TEA_STATION': create_tea,
        'KITCHEN_SNACK_BAR': create_snack_bar,
    }
    
    base_dir = "webview-ui/public/assets/furniture"
    dist_dir = "dist/webview/assets/furniture"
    dist2_dir = "dist/assets/furniture"
    backup_dir = "backup chat/images"
    
    os.makedirs(backup_dir, exist_ok=True)
    
    for name, gen in generators.items():
        img = gen()
        target_dir = os.path.join(base_dir, name)
        os.makedirs(target_dir, exist_ok=True)
        target_path = os.path.join(target_dir, f"{name}.png")
        img.save(target_path, "PNG")
        print(f"Saved {name}.png ({img.size}) to {target_path}")
        
        # Copy to dist if exists
        for d_dir in [dist_dir, dist2_dir]:
            if os.path.exists(d_dir):
                d_target = os.path.join(d_dir, name)
                os.makedirs(d_target, exist_ok=True)
                img.save(os.path.join(d_target, f"{name}.png"), "PNG")
                
        # Copy to backup chat images
        img.save(os.path.join(backup_dir, f"2026-10-19_cucina_{name.lower()}.png"), "PNG")

if __name__ == "__main__":
    main()
