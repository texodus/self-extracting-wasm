import { test, expect } from '@playwright/test';
import * as fs from "node:fs";
import "zx/globals";
import { compress } from "../compress.mjs";

test("CLI roundtrip", async ({ page }) => {
    await page.goto("http://localhost:3000/tests/index.html");
    await $`node main.mjs README.md --output ./test.wasm`;
    try {
        const results = await page.evaluate(async () => {
            const { extract } = await import("../extract.mjs");
            const req = fetch("../test.wasm");
            const result = await extract(req);
            return new TextDecoder().decode(result.buffer);
        });

        expect(results).toEqual(fs.readFileSync("./README.md").toString());
    } finally {
        fs.unlinkSync("./test.wasm");
    }
});

async function read_section_in_page(page, file, name) {
    return await page.evaluate(async ([file, name]) => {
        const { extract, read_section } = await import("../extract.mjs");
        const bin = await WebAssembly.instantiateStreaming(fetch(file));
        const result = await extract(bin);
        return {
            data: read_section(bin, name),
            module_data: read_section(bin.module, name),
            text: new TextDecoder().decode(result.buffer),
        };
    }, [file, name]);
}

test("CLI custom section roundtrip", async ({ page }) => {
    await page.goto("http://localhost:3000/tests/index.html");
    await $`node main.mjs README.md --output ./test-section.wasm --section-name meta --section-data a=1 --section-data eq=x=y`;
    try {
        const { data, module_data, text } = await read_section_in_page(page, "../test-section.wasm", "meta");
        expect(data).toEqual({ a: "1", eq: "x=y" });
        expect(module_data).toEqual(data);
        expect(text).toEqual(fs.readFileSync("./README.md").toString());
    } finally {
        fs.unlinkSync("./test-section.wasm");
    }
});

test("CLI custom section with no data", async ({ page }) => {
    await page.goto("http://localhost:3000/tests/index.html");
    await $`node main.mjs README.md --output ./test-empty-section.wasm --section-name meta`;
    try {
        const { data } = await read_section_in_page(page, "../test-empty-section.wasm", "meta");
        expect(data).toEqual({});
    } finally {
        fs.unlinkSync("./test-empty-section.wasm");
    }
});

test("read_section returns undefined for a missing section", async ({ page }) => {
    await page.goto("http://localhost:3000/tests/index.html");
    await $`node main.mjs README.md --output ./test-no-section.wasm`;
    try {
        const { data } = await read_section_in_page(page, "../test-no-section.wasm", "meta");
        expect(data).toBeUndefined();
    } finally {
        fs.unlinkSync("./test-no-section.wasm");
    }
});

test("API custom section with non-ASCII name and nested data", async ({ page }) => {
    await page.goto("http://localhost:3000/tests/index.html");
    const data = { version: "1.2.3", nested: { n: 42, list: [true, null, "ü"] } };
    await compress("./README.md", "./test-api-section.wasm", { section: { name: "méta-✓", data } });
    try {
        const result = await read_section_in_page(page, "../test-api-section.wasm", "méta-✓");
        expect(result.data).toEqual(data);
        expect(result.text).toEqual(fs.readFileSync("./README.md").toString());
    } finally {
        fs.unlinkSync("./test-api-section.wasm");
    }
});

test("API rejects invalid sections", async () => {
    for (const section of [
        { name: "psp-len", data: {} },
        { name: "psp-runtime", data: {} },
        { name: "", data: {} },
        { name: "meta", data: [1, 2] },
        { name: "meta", data: "str" },
        { name: "meta", data: new Map() },
    ]) {
        await expect(compress("./README.md", "./test-invalid.wasm", { section })).rejects.toThrow();
    }

    expect(fs.existsSync("./test-invalid.wasm")).toBe(false);
});

test("CLI rejects invalid section arguments", async () => {
    for (const args of [
        ["--section-name", "psp-len"],
        ["--section-data", "a=1"],
        ["--section-name", "meta", "--section-data", "novalue"],
        ["--section-name", "meta", "--section-data", "a=1", "--section-data", "a=2"],
        ["--section-name", "meta", "--section-name", "other"],
    ]) {
        const result = await $`node main.mjs README.md --output ./test-cli-invalid.wasm ${args}`.nothrow().quiet();
        expect(result.exitCode).not.toBe(0);
    }

    expect(fs.existsSync("./test-cli-invalid.wasm")).toBe(false);
});
