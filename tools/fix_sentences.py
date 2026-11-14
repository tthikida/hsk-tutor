import sys
p=sys.argv[1]
fix={
"问":"我能问你吗？\tCan I ask you?",
"还有":"我还有一个朋友在北京。\tI also have a friend in Beijing.",
"有一些":"我有一些钱。\tI have some money.",
"对":"你说的对。\tWhat you said is right.",
"跑":"快跑！\tRun, quick!",
"唱":"她在唱歌。\tShe's singing.",
"考":"他考了一百。\tHe scored 100 on the test.",
"天气":"今天天气好吗？\tIs the weather nice today?",
"衣服":"你的衣服很好看。\tYour clothes look great.",
"票":"我买了票。\tI bought the tickets.",
"车票":"我买了车票。\tI bought the bus tickets.",
"左":"请走左边。\tPlease walk on the left.",
"右":"请走右边。\tPlease walk on the right.",
"路口":"车站在路口右边。\tThe station is to the right of the intersection.",
"没事儿":"没事儿，你去吧。\tIt's fine, go ahead.",
"叫":"我叫小白。\tMy name is Xiaobai.",
"路":"我走这个路回家。\tI take this road home.",
"来到":"你什么时候来到北京的？\tWhen did you arrive in Beijing?",
"小时":"我一天工作八个小时。\tI work eight hours a day.",
"学习":"我今天学习了汉语。\tI studied Chinese today.",
"先生":"先生，您好！\tHello, sir!",
"远":"学校很远。\tThe school is far.",
"不用":"不用，谢谢。\tNo need, thanks.",
"汽车":"这是新汽车。\tThis is a new car.",
"西":"我不知道东西南北。\tI can't tell which way is which.",
"回答":"请回答我。\tPlease answer me.",
"飞":"飞机在天上飞。\tThe plane is flying in the sky.",
"小孩儿":"这个小孩儿三岁。\tThis little kid is three.",
}
out=[]
for line in open(p,encoding="utf-8"):
    w=line.split("\t")[0]
    out.append(w+"\t"+fix[w]+"\n" if w in fix else line)
open(p,"w",encoding="utf-8").writelines(out)
