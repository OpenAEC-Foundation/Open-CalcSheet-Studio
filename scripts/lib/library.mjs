/**
 * De Library voor de controlescripts: dezelfde weg als de app (haalLibrary), maar dan
 * uit de map library/ op schijf in plaats van uit de repository.
 */
import { readFile } from "node:fs/promises";
import { haalLibrary } from "../../packages/desktop/src/store/library.ts";

export const LIBRARY_MAP = new URL("../../library/", import.meta.url);

/** Een `fetch` die uit de map leest: een bestand dat er niet is, geeft 404. */
export const leesUitMap = async (url) => {
  try {
    return new Response(await readFile(new URL(url.slice("map:/".length), LIBRARY_MAP), "utf8"));
  } catch {
    return new Response("", { status: 404 });
  }
};

export const laadLibrary = () => haalLibrary("map:", leesUitMap);
