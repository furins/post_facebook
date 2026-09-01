import { describe, expect, it } from "vitest";
import { belongsToAllowedDomain } from "./access-control";

describe("email domain access control", () => {
  it("accepts the configured school domain case-insensitively", () => {
    expect(belongsToAllowedDomain("Docente@ICBADIATRECENTA.EDU.IT")).toBe(true);
  });

  it("rejects empty local parts, other domains and subdomains", () => {
    expect(belongsToAllowedDomain("@icbadiatrecenta.edu.it")).toBe(false);
    expect(belongsToAllowedDomain("docente@gmail.com")).toBe(false);
    expect(belongsToAllowedDomain("docente@sede.icbadiatrecenta.edu.it")).toBe(false);
  });
});
