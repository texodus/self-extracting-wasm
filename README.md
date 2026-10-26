`pro-self-extracting-wasm` is a CLI utility for compiling self-extracting
WebAssembly executables for use in the browser.

## Usage

Install the CLI compiler and runtime library

```bash
npm install pro-self-extracting-wasm
```

Compile your target

```bash
npm exec pro_self_extracting_wasm ./my_assembly.wasm --output my_assembly.compressed.wasm
```

Unzip the bundle in JavaScript

```javascript
import {extract} from "pro-self-extracting-wasm";
const my_assembly = await extract(fetch("./my_assembly.compressed.wasm"));
```


## Custom section metadata

You can embed a JSON object as a named custom section in the compressed
bundle. Because it lives outside the compressed payload, it can be read
without decompressing anything.

```bash
npm exec pro_self_extracting_wasm ./my_assembly.wasm --output my_assembly.compressed.wasm \
    --section-name my-meta \
    --section-data version=1.2.3 \
    --section-data build=abc123
```

`--section-data <key>=<value>` may be repeated. The value is everything after
the first `=`, and CLI values are always strings. From JavaScript, `data` can
be any JSON-serializable plain object:

```javascript
import {compress} from "pro-self-extracting-wasm";
await compress("my_assembly.wasm", "my_assembly.compressed.wasm", {
    section: {name: "my-meta", data: {version: "1.2.3", build: {sha: "abc123"}}},
});
```

The section names `psp-runtime` and `psp-len` are reserved. To read the
section, instantiate the bundle yourself and pass it to both `read_section`
and `extract`:

```javascript
import {extract, read_section} from "pro-self-extracting-wasm";
const bundle = await WebAssembly.instantiateStreaming(fetch("./my_assembly.compressed.wasm"));
const meta = read_section(bundle, "my-meta"); // {version: "1.2.3", build: "abc123"}
const my_assembly = await extract(bundle);
```

`read_section` accepts either a `WebAssembly.Module` or an
`instantiate()` result, and returns `undefined` if the section is absent.
