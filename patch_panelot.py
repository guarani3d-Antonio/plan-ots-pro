with open('src/components/plano/PanelOT.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Sacar setVisorIndex del useState (ya no tiene caller)
c = c.replace(
  "const [visorIndex,   setVisorIndex]   = useState(0);",
  "const [visorIndex] = useState(0);", 1
)

# Sacar setVisorFotos del useState (ya no tiene caller)
c = c.replace(
  "const [visorFotos,   setVisorFotos]   = useState<FotoVisor[]>([]);",
  "const [visorFotos] = useState<FotoVisor[]>([]);", 1
)

with open('src/components/plano/PanelOT.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Patch 2 PanelOT OK -", c.count('\n'), "lineas")