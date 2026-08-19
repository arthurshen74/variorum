/**
 * A scripted OpenAI-compatible SSE endpoint for acceptance tests: a real
 * localhost HTTP server, CORS-enabled exactly like LM Studio's toggle.
 * Specs control chunk pacing, held-open streams, and error responses, so
 * every mock sits at the network boundary — nothing inside the app is
 * faked (CLAUDE.md harness rules).
 */
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';

export interface Chunk {
  content?: string;
  reasoning?: string;
  delayMs?: number;
}

export interface ScriptedResponse {
  /** Non-200 short-circuits with an error body and no stream. */
  status?: number;
  chunks?: Chunk[];
  /** Keep the stream open after the chunks; finish via release(). */
  holdOpen?: boolean;
  /** OpenAI finish_reason on the closing event; 'length' means truncated. */
  finishReason?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function sseEvent(delta: Record<string, unknown>, finish: string | null) {
  return `data: ${JSON.stringify({
    id: 'mock',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'mock-model',
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockLlm {
  private server: Server | undefined;
  private script: ScriptedResponse[] = [];
  private held: ServerResponse | undefined;
  private heldFinishReason: string | undefined;
  /** Parsed JSON bodies of every completion request, in order. */
  readonly requests: Record<string, unknown>[] = [];
  /** Headers of every completion request, in order (names lowercased by node). */
  readonly headers: IncomingHttpHeaders[] = [];
  url = '';

  /** Responses are consumed one per request; the last one repeats. */
  respondWith(...responses: ScriptedResponse[]): void {
    this.script = [...responses];
  }

  async start(): Promise<void> {
    const server = createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }
      let raw = '';
      req.on('data', (piece: Buffer) => {
        raw += String(piece);
      });
      req.on('end', () => {
        this.requests.push(JSON.parse(raw) as Record<string, unknown>);
        this.headers.push(req.headers);
        const scripted =
          this.script.length > 1
            ? (this.script.shift() as ScriptedResponse)
            : (this.script[0] ?? {});
        void this.play(res, scripted);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('mock llm failed to bind a port');
    }
    this.server = server;
    this.url = `http://127.0.0.1:${address.port}/v1`;
  }

  private async play(res: ServerResponse, scripted: ScriptedResponse) {
    if (scripted.status !== undefined && scripted.status !== 200) {
      res.writeHead(scripted.status, {
        ...CORS_HEADERS,
        'content-type': 'application/json',
      });
      res.end(JSON.stringify({ error: { message: 'scripted failure' } }));
      return;
    }
    res.writeHead(200, {
      ...CORS_HEADERS,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    for (const chunk of scripted.chunks ?? []) {
      if (chunk.delayMs !== undefined) await sleep(chunk.delayMs);
      const { delayMs: _delayMs, ...delta } = chunk;
      res.write(sseEvent(delta, null));
    }
    if (scripted.holdOpen === true) {
      this.held = res;
      this.heldFinishReason = scripted.finishReason;
      return;
    }
    this.finish(res, scripted.finishReason);
  }

  /** Finish a held stream, optionally emitting more chunks first. */
  release(extraChunks: Chunk[] = []): void {
    const res = this.held;
    if (res === undefined) throw new Error('no held stream to release');
    this.held = undefined;
    for (const chunk of extraChunks) {
      const { delayMs: _delayMs, ...delta } = chunk;
      res.write(sseEvent(delta, null));
    }
    this.finish(res, this.heldFinishReason);
  }

  private finish(res: ServerResponse, reason = 'stop'): void {
    res.write(sseEvent({}, reason));
    res.write('data: [DONE]\n\n');
    res.end();
  }

  async close(): Promise<void> {
    this.held?.end();
    this.held = undefined;
    const server = this.server;
    if (server === undefined) return;
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
}
