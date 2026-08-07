# 飞书自动训练接入

后端入口：feishu-worker.mjs

功能：
- 每天北京时间 09:00 推送第一题，用户直接在飞书聊天回答；
- 每题返回五维评价、主要卡点、改进建议和面试版回答；
- 完成 3 题后发送当日日报；
- 每周日 20:00 发送周报，汇总题目、原回答、AI 优化回答、问题与知识点。

所需飞书配置：
1. 企业自建应用，开启机器人能力；
2. 权限 im:message:send_as_bot；
3. 订阅 im.message.receive_v1，并把 Worker URL 设为请求地址；
4. 配置 App ID、App Secret 和接收人的 open_id（或群聊 chat_id）。

公开变量和密钥名称见 wrangler.toml.example。回答与训练历史保存在 KV。