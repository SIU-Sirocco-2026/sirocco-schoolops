import { createConnection } from "node:net";

export interface VirusScanner {
  scan(
    data: Buffer,
  ): Promise<{ clean: boolean; message: string; version: string }>;
  version(): Promise<string>;
}
export class ClamScanner implements VirusScanner {
  constructor(
    private host = process.env.CLAMAV_HOST || "clamav",
    private port = 3310,
    private timeout = 30000,
  ) {}
  private command(command: string, data?: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let response = "";
      const timer = setTimeout(
        () => socket.destroy(new Error("Scanner timeout")),
        this.timeout,
      );
      socket.on("connect", () => {
        socket.write(`z${command}\0`);
        if (data) {
          for (let offset = 0; offset < data.length; offset += 65536) {
            const chunk = data.subarray(offset, offset + 65536),
              size = Buffer.alloc(4);
            size.writeUInt32BE(chunk.length);
            socket.write(size);
            socket.write(chunk);
          }
          socket.write(Buffer.alloc(4));
        }
      });
      socket.on("data", (chunk) => {
        response += chunk.toString();
        if (response.length > 8192)
          socket.destroy(new Error("Invalid scanner response"));
        if (response.includes("\0") || response.includes("\n")) socket.end();
      });
      socket.on("error", reject);
      socket.on("close", () => {
        clearTimeout(timer);
        if (!response || (!response.includes("\0") && !response.includes("\n")))
          reject(new Error("Scanner unavailable or truncated response"));
        else resolve(response.replace(/[\0\n]+$/, ""));
      });
    });
  }
  async version() {
    const value = await this.command("VERSION");
    if (!value.startsWith("ClamAV "))
      throw new Error("Invalid scanner version");
    return value;
  }
  async scan(data: Buffer) {
    const version = await this.version(),
      reply = await this.command("INSTREAM", data);
    if (reply === "stream: OK")
      return { clean: true, message: "Tệp sạch", version };
    if (/^stream: .+ FOUND$/.test(reply))
      return { clean: false, message: reply.slice(0, 250), version };
    throw new Error("Scanner did not confirm safety");
  }
}
