import os,sys,urllib.request
root=sys.argv[1]; env={}
for l in open(root+"/.env"):
    if "=" in l and not l.startswith("#"): k,v=l.strip().split("=",1); env[k]=v.strip()
key,reg=env.get("AZURE_SPEECH_KEY",""),env.get("AZURE_SPEECH_REGION","")
print("key length",len(key),"region",reg)
for voice in ["zh-CN-XiaoxiaoNeural","zh-CN-YunxiNeural"]:
    ssml=f'<speak version="1.0" xml:lang="zh-CN"><voice name="{voice}">你好！我是你的中文老师。</voice></speak>'
    req=urllib.request.Request(f"https://{reg}.tts.speech.microsoft.com/cognitiveservices/v1",data=ssml.encode(),headers={"Ocp-Apim-Subscription-Key":key,"Content-Type":"application/ssml+xml","X-Microsoft-OutputFormat":"audio-24khz-48kbitrate-mono-mp3","User-Agent":"hsk-tutor"})
    try:
        b=urllib.request.urlopen(req,timeout=30).read()
        open(f"{root}/app/audio/samples/{voice}.mp3","wb").write(b); print(voice,"OK",len(b),"bytes")
    except Exception as e: print(voice,"FAILED",e)
