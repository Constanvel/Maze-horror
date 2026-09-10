import pathlib, re

p = pathlib.Path(r"D:\Maze-horror\Maze-horror\script.js")
content = p.read_text(encoding="utf-8")

# Pattern: identifier=<newline>gba(...)
# This was originally: identifier=`rgba(...)`  but backtick+r was eaten by PowerShell
def fix_rgba(m):
    inner = m.group(1)
    return "='rgba(" + inner + ")'"

content = re.sub(r"=\r?\ngba\(([^;\n]+?)\)", fix_rgba, content)
p.write_text(content, encoding="utf-8")
print("done")
