import os
import re

eval_dir = "/home/vortex/Desktop/Projects/vortex-chess-engine/src/evaluation"

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Match for (const [sq_var, p_var] of board.getAllPieces()) {
    pattern = r"for\s*\(\s*const\s*\[\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*\]\s*of\s*board\.getAllPieces\(\)\s*\)\s*\{"
    
    def repl(m):
        sq_var = m.group(1)
        p_var = m.group(2)
        # Generate the replacement
        return f"""let __bb = board.allBB;
    while (__bb) {{
      const {sq_var} = import_utils_bitScanForward ? import_utils_bitScanForward(__bb) : 0; // Will fix imports later if needed, but wait!
      const {p_var} = board.getPiece({sq_var})!;
      __bb &= __bb - 1n;"""

    # Actually, importing bitScanForward everywhere is annoying.
    # Let's just use a simple 64-square loop which is STILL way faster than array allocation.
    
    pattern2 = r"for\s*\(\s*const\s*\[\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*\]\s*of\s*board\.getAllPieces\(\)\s*\)\s*\{"
    def repl2(m):
        sq_var = m.group(1)
        p_var = m.group(2)
        return f"""for (let {sq_var} = 0; {sq_var} < 64; {sq_var}++) {{
      const {p_var} = board.getPiece({sq_var});
      if (!{p_var}) continue;"""

    new_content = re.sub(pattern2, repl2, content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk(eval_dir):
    for f in files:
        if f.endswith(".ts"):
            process_file(os.path.join(root, f))
