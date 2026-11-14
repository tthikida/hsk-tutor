import json,sys
d=json.load(open(sys.argv[1]+"/app/data/hsk1.json"))
W={w["id"]:w for w in d["words"]}
print(" ".join(o["id"]+"="+W[o["id"]]["py"] for o in d["order"] if o["type"]=="word"))
