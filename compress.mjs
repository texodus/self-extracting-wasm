// ┌───────────────────────────────────────────────────────────────────────────┐
// │                                                                           │
// │  ██████╗ ██████╗  ██████╗   Copyright (C) 2025, The Prospective Company   │
// │  ██╔══██╗██╔══██╗██╔═══██╗                                                │
// │  ██████╔╝██████╔╝██║   ██║  This file is part of the Procss library,      │
// │  ██╔═══╝ ██╔══██╗██║   ██║  distributed under the terms of the            │
// │  ██║     ██║  ██║╚██████╔╝  Apache License 2.0.  The full license can     │
// │  ╚═╝     ╚═╝  ╚═╝ ╚═════╝   be found in the LICENSE file.                 │
// │                                                                           │
// └───────────────────────────────────────────────────────────────────────────┘

import { deflateSync } from 'node:zlib';
import fs from "node:fs";
import path from "node:path";
import leb from 'leb128';
import * as url from "url";

export { extract, read_section } from "./extract.mjs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

const runtime = fs.readFileSync(path.join(__dirname, "./runtime.wasm"));

const RESERVED_SECTIONS = ["psp-runtime", "psp-len"];

function write_custom_section(runtime, name, data) {
    const name_bytes = new TextEncoder().encode(name);
    let parts = [0, 0];
    parts = parts.concat(...Uint8Array.from(leb.unsigned.encode(name_bytes.byteLength)));
    parts = parts.concat(...name_bytes);
    parts = parts.concat(Array.from(Uint8Array.from(data)));
    const len_leb = leb.unsigned.encode(parts.length - 2);
    parts.splice(1, 1, ...Uint8Array.from(len_leb));
    const runtime2 = new Uint8Array(runtime.byteLength + parts.length);
    runtime2.set(runtime, 0);
    runtime2.set(parts, runtime.byteLength);
    return runtime2;
}

function encode_section({ name, data }) {
    if (typeof name !== "string" || name.length === 0) {
        throw new Error("Custom section name must be a non-empty string");
    }

    if (RESERVED_SECTIONS.includes(name)) {
        throw new Error(`Custom section name "${name}" is reserved`);
    }

    const proto = data === null || typeof data !== "object" ? undefined : Object.getPrototypeOf(data);
    if (proto !== Object.prototype && proto !== null) {
        throw new Error("Custom section data must be a plain object");
    }

    return new TextEncoder().encode(JSON.stringify(data));
}

export async function compress(input, output, options = {}) {
    const section = options.section && encode_section(options.section);
    const input_data = fs.readFileSync(input);
    const results = deflateSync(input_data);

    let runtime2 = write_custom_section(runtime, "psp-runtime", results);
    const x = new Uint8Array(4);
    const view = new DataView(x.buffer);
    view.setUint32(0, input_data.byteLength, true);
    runtime2 = write_custom_section(runtime2, "psp-len", x);
    if (section) {
        runtime2 = write_custom_section(runtime2, options.section.name, section);
    }

    fs.writeFileSync(output || input, runtime2);
    console.log(`pro_self_extracting_wasm wrote ${runtime2.byteLength} bytes`);
}

function fail(message) {
    console.error(`pro_self_extracting_wasm: ${message}`);
    process.exit(1);
}

export async function compress_main() {
    let input, output, section_name;
    const section_data = new Map();
    const args = process.argv.slice(2);
    while (args.length > 0) {
        const arg = args.shift();
        if (arg === "--output") {
            output = args.shift();
        } else if (arg === "--section-name") {
            if (section_name !== undefined) {
                fail("--section-name may only be given once");
            }

            section_name = args.shift();
        } else if (arg === "--section-data") {
            const pair = args.shift();
            const idx = pair?.indexOf("=") ?? -1;
            if (idx === -1) {
                fail(`--section-data expects <key>=<value>, got ${pair}`);
            }

            const key = pair.slice(0, idx);
            if (section_data.has(key)) {
                fail(`duplicate --section-data key "${key}"`);
            }

            section_data.set(key, pair.slice(idx + 1));
        } else {
            input = arg;
        }
    }

    if (section_data.size > 0 && section_name === undefined) {
        fail("--section-data requires --section-name");
    }

    const options = {};
    if (section_name !== undefined) {
        options.section = { name: section_name, data: Object.fromEntries(section_data) };
    }

    try {
        await compress(input, output || input, options);
    } catch (e) {
        fail(e.message);
    }
}
