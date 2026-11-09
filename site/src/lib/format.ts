// Formatting for calls and numbers shown on the site.

/** 0xbd770416a3345f91e4b34576cb804a576fa48eb1 -> 0xbd77…8eb1 */
export function shortHex(hex: string): string {
  return hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex;
}

/** 63943086030706054941702419180308291968568539214185280263325138216467852686274 -> 6394308603…2686274 */
export function shortDecimal(d: string, head = 10, tail = 7): string {
  return d.length > head + tail + 1 ? `${d.slice(0, head)}…${d.slice(-tail)}` : d;
}

/**
 * "balanceOf(address)" with words ["4098"] -> "balanceOf(0x1002)".
 * Only the words the signature has arguments for are used.
 */
export function formatCall(signature: string, words: string[]): string {
  const m = /^(\w+)\((.*)\)$/.exec(signature);
  if (!m) return signature;
  const types = m[2] === "" ? [] : m[2].split(",");
  const args = types.map((t, i) => {
    const w = BigInt(words[i] ?? "0");
    return t === "address" ? shortHex("0x" + w.toString(16)) : w.toString();
  });
  return `${m[1]}(${args.join(", ")})`;
}

/** "deposit()  value=1 wei" style tail for payable calls. */
export function formatValue(wei: string): string {
  return wei === "0" ? "" : `value=${wei} wei`;
}

/** A whole call as one line: call, then value when there is one. */
export function callLine(signature: string, words: string[], value: string): string {
  const v = formatValue(value);
  return v ? `${formatCall(signature, words)}  ${v}` : formatCall(signature, words);
}
