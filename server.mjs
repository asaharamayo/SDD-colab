// Custom server: Next.js request handling + a Yjs sync/awareness relay on the
// same port/process, so one `npm run host` gives you the web app AND live
// multi-cursor collaboration (PRD §4.6 async-first, §5.2 workspace).
//
// Wire protocol matches `y-websocket`'s client (`WebsocketProvider`) exactly —
// messageSync (0) + messageAwareness (1) framed with lib0 varint encoding —
// so the browser can use the stock y-websocket client while this relay stays
// a small, auditable ~100 lines instead of depending on y-websocket's CLI
// server internals.
import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

/** @type {Map<string, { doc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Map<import('ws').WebSocket, Set<number>> }>} */
const rooms = new Map();

function getRoom(name) {
  let room = rooms.get(name);
  if (room) return room;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const conns = new Map();
  room = { doc, awareness, conns };

  doc.on("update", (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    conns.forEach((_ids, conn) => {
      if (conn !== origin && conn.readyState === conn.OPEN) {
        conn.send(message);
      }
    });
  });

  awareness.on("update", ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated, removed);
    if (origin && conns.has(origin)) {
      const ids = conns.get(origin);
      added.forEach((id) => ids.add(id));
      removed.forEach((id) => ids.delete(id));
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
    );
    const message = encoding.toUint8Array(encoder);
    conns.forEach((_ids, conn) => {
      if (conn.readyState === conn.OPEN) conn.send(message);
    });
  });

  rooms.set(name, room);
  return room;
}

function setupConnection(conn, room) {
  conn.binaryType = "arraybuffer";
  room.conns.set(conn, new Set());

  // Initial sync step 1 (the room's current state vector).
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    conn.send(encoding.toUint8Array(encoder));
  }
  // Replay current presence (everyone else's cursors) to the new joiner.
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(states.keys()),
      ),
    );
    conn.send(encoding.toUint8Array(encoder));
  }

  conn.on("message", (data) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case MESSAGE_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
          if (encoding.length(encoder) > 1) {
            conn.send(encoding.toUint8Array(encoder));
          }
          break;
        }
        case MESSAGE_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            conn,
          );
          break;
        }
      }
    } catch (err) {
      console.error("[yjs] message handling failed", err);
    }
  });

  conn.on("close", () => {
    const ids = room.conns.get(conn);
    room.conns.delete(conn);
    if (ids && ids.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        Array.from(ids),
        null,
      );
    }
  });
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  const nextUpgrade = app.getUpgradeHandler();

  const YJS_PREFIX = "/api/yjs/";
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname.startsWith(YJS_PREFIX)) {
      wss.handleUpgrade(req, socket, head, (conn) => {
        const roomName = decodeURIComponent(pathname.slice(YJS_PREFIX.length)) || "default";
        setupConnection(conn, getRoom(roomName));
      });
    } else if (pathname.startsWith("/_next/")) {
      nextUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    console.log(
      `> Unified Spec Workspace ready on http://${hostname}:${port} (live collab on /api/yjs)`,
    );
  });
});
