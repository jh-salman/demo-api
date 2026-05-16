import { createServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { setIo } from "./realtime/io.js";

const app = createApp();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST", "OPTIONS"] },
});
setIo(io);

io.on("connection", (socket) => {
  /** Optional: join `room:config:web` | `room:config:admin` for future room-scoped emits. */
  socket.on("subscribe:config", (payload: { forWeb?: boolean } = {}) => {
    socket.leave("room:config:admin");
    socket.leave("room:config:web");
    if (payload?.forWeb) socket.join("room:config:web");
    else socket.join("room:config:admin");
  });
});

httpServer.listen(env.PORT, () => {
  console.log(`demo-api (Express + Prisma + Socket.IO) http://localhost:${env.PORT}`);
  console.log("[demo-api] Config schema: s4.headerLogo + headerLogoAdjust enabled");
});
