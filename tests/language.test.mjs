import test from "node:test";
import assert from "node:assert/strict";
import {initialLanguage} from "../app/language.ts";

test("mobile follows the primary browser language and desktop preserves its choice",()=>{
  assert.equal(initialLanguage(true,["ru-RU","en-US"],"en"),"ru");
  assert.equal(initialLanguage(true,["en-US","ru"],"ru"),"en");
  assert.equal(initialLanguage(true,["fr-FR","ru"],null),"en");
  assert.equal(initialLanguage(true,[],null),"en");
  assert.equal(initialLanguage(false,["ru-RU"],"en"),"en");
  assert.equal(initialLanguage(false,["en-US"],"ru"),"ru");
});
