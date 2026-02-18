declare module 'pako' {
  export function inflate(data: Uint8Array | ArrayBuffer | Buffer | string, options?: any): Uint8Array | string
  export function deflate(data: Uint8Array | ArrayBuffer | Buffer | string, options?: any): Uint8Array | string
}
