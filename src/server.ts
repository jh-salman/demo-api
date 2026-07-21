import { createServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { cacheEnabled } from "./lib/redisCache.js";
import {
  createIoRedisConnection,
  getIoRedis,
  ioRedisEnabled,
} from "./lib/ioredis.js";
import { setIo, salonRoom } from "./realtime/io.js";
import { startGhostNotesWorker } from "./modules/ghost-notes/ghost-notes.worker.js";
import { ghostNotesQueueEnabled } from "./modules/ghost-notes/ghost-notes.queue.js";

const app = createApp();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST", "OPTIONS"] },
});

// Multi-instance realtime: fan out every io.emit(...) across instances via Redis
// pub/sub. Single-instance dev works fine without REDIS_URL.
let redisAdapterEnabled = false;
if (ioRedisEnabled()) {
  const pubClient = getIoRedis();
  const subClient = createIoRedisConnection();
  if (pubClient && subClient) {
    io.adapter(createAdapter(pubClient, subClient));
    redisAdapterEnabled = true;
  }
}

setIo(io);

io.on("connection", (socket) => {
  /** Optional: join `room:config:web` | `room:config:admin` for future room-scoped emits. */
  socket.on("subscribe:config", (payload: { forWeb?: boolean } = {}) => {
    socket.leave("room:config:admin");
    socket.leave("room:config:web");
    if (payload?.forWeb) socket.join("room:config:web");
    else socket.join("room:config:admin");
  });

  /** Join salon-scoped room so park/waitlist/appointments fan out to all staff devices. */
  socket.on("subscribe:salon", (payload: { salonId?: string } = {}) => {
    for (const room of socket.rooms) {
      if (room.startsWith("salon:")) socket.leave(room);
    }
    const id =
      typeof payload.salonId === "string" && payload.salonId.trim()
        ? payload.salonId.trim()
        : "default";
    socket.join(salonRoom(id));
  });
});

httpServer.listen(env.PORT, () => {
  console.log(`demo-api (Express + Prisma + Socket.IO) http://localhost:${env.PORT}`);
  console.log("[demo-api] Config schema: s4.headerLogo + headerLogoAdjust enabled");
  if (cacheEnabled()) {
    console.log(
      `[demo-api] Catalog cache: ioredis ON (clients/staff/service/product, TTL ${env.CLIENTS_CACHE_TTL_SECONDS}s)`,
    );
  } else {
    console.log("[demo-api] Catalog cache: OFF (set REDIS_URL)");
  }
  console.log(
    redisAdapterEnabled
      ? "[demo-api] Socket.IO Redis adapter: ON (multi-instance realtime)"
      : "[demo-api] Socket.IO Redis adapter: OFF (set REDIS_URL for scaling)",
  );
  if (env.GHOST_NOTES_ENABLED) {
    if (ghostNotesQueueEnabled() && env.GHOST_NOTES_INLINE_WORKER) {
      startGhostNotesWorker();
    } else if (ghostNotesQueueEnabled()) {
      console.log(
        "[ghost-notes] Queue ON — run `npm run worker:ghost-notes` for BullMQ worker",
      );
    } else {
      console.log("[ghost-notes] Inline mode (no REDIS_URL — briefs run in-process)");
    }
  } else {
    console.log("[ghost-notes] Disabled (GHOST_NOTES_ENABLED=0)");
  }
});
