# 飞书长连接版发布

这个目录不需要域名，也不需要飞书“请求地址”。

1. 在 Replit 导入 GitHub 仓库。
2. 进入 feishu-long-connection 目录，执行 npm install，然后 npm start。
3. 在 Replit Secrets 中添加 FEISHU_APP_ID、FEISHU_APP_SECRET、OPENAI_API_KEY、OPENAI_MODEL。
4. 先点击 Run，看到 Feishu long connection started。
5. 回到飞书事件配置，选择“使用长连接接收事件”。
6. 添加“接收消息 v2.0 / im.message.receive_v1”，保存并发布应用。
7. 在飞书给机器人发“开始训练”。服务第一次收到消息后会自动记住 chat_id。

长连接模式由飞书 SDK 建立 WebSocket，不需要 Cloudflare Worker 的回调 URL。