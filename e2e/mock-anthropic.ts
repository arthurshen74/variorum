/**
 * A scripted Anthropic Messages SSE endpoint for acceptance tests: a
 * real localhost HTTP server, CORS-enabled, serving POST /v1/messages.
 * The MockLlm pattern applied to the second wire protocol — every mock
 * sits at the network boundary, nothing inside the app is faked.
 */
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';

export interface AnthropicScript {
  /** Non-200 short-circuits with an error body and no stream. */
  status?: number;
  thinking?: string[];
  text?: string[];
  /** 'end_turn' by default; 'max_tokens' means truncated. */
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function sse(event: Record<string, unknown>): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

export class MockAnthropic {
  private server: Server | undefined;
  private script: AnthropicScript[] = [];
  /** Parsed JSON bodies of every /v1/messages request, in order. */
  readonly requests: Record<string, unknown>[] = [];
  /** Headers of every request, in order (names lowercased by node). */
  readonly headers: IncomingHttpHeaders[] = [];
  /** Request paths, in order. */
  readonly paths: string[] = [];
  url = '';

  /** Responses are consumed one per request; the last one repeats. */
  respondWith(...responses: AnthropicScript[]): void {
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
        this.paths.push(req.url ?? '');
        const scripted =
          this.script.length > 1
            ? (this.script.shift() as AnthropicScript)
            : (this.script[0] ?? {});
        this.play(res, scripted);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('mock anthropic failed to bind a port');
    }
    this.server = server;
    this.url = `http://127.0.0.1:${address.port}/v1`;
  }

  private play(res: ServerResponse, scripted: AnthropicScript): void {
    if (scripted.status !== undefined && scripted.status !== 200) {
      res.writeHead(scripted.status, {
        ...CORS_HEADERS,
        'content-type': 'application/json',
      });
      res.end(
        JSON.stringify({
          type: 'error',
          error: { type: 'api_error', message: 'scripted failure' },
        }),
      );
      return;
    }
    res.writeHead(200, {
      ...CORS_HEADERS,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    res.write(
      sse({
        type: 'message_start',
        message: {
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          model: 'mock-model',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: scripted.inputTokens ?? 3, output_tokens: 1 },
        },
      }),
    );
    let index = 0;
    if (scripted.thinking !== undefined) {
      res.write(
        sse({
          type: 'content_block_start',
          index,
          content_block: { type: 'thinking', thinking: '' },
        }),
      );
      for (const thinking of scripted.thinking) {
        res.write(
          sse({
            type: 'content_block_delta',
            index,
            delta: { type: 'thinking_delta', thinking },
          }),
        );
      }
      res.write(sse({ type: 'content_block_stop', index }));
      index += 1;
    }
    res.write(
      sse({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      }),
    );
    for (const text of scripted.text ?? ['ok']) {
      res.write(
        sse({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text },
        }),
      );
    }
    res.write(sse({ type: 'content_block_stop', index }));
    res.write(
      sse({
        type: 'message_delta',
        delta: {
          stop_reason: scripted.stopReason ?? 'end_turn',
          stop_sequence: null,
        },
        usage: { output_tokens: scripted.outputTokens ?? 2 },
      }),
    );
    res.write(sse({ type: 'message_stop' }));
    res.end();
  }

  async close(): Promise<void> {
    const server = this.server;
    if (server === undefined) return;
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
}
