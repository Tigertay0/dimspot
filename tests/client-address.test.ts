import { describe, expect, it } from "vitest";
import { addressBucket, clientAddress, networkKey } from "@/lib/client-address";

describe("networkKey", () => {
  it("keeps an IPv4 address whole", () => {
    expect(networkKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("keys IPv6 by its /64, however it is written", () => {
    const a = networkKey("2001:db8:abcd:12::1");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(networkKey("2001:0db8:abcd:0012:ffff:ffff:ffff:fffe")).toBe(a);
    expect(networkKey("2001:DB8:ABCD:12:0:0:0:9%eth0")).toBe(a);
    expect(networkKey("2001:db8:abcd:13::1")).not.toBe(a);
    expect(networkKey("::1")).toBe("0:0:0:0::/64");
  });

  it("treats an IPv4-mapped address as the IPv4 address", () => {
    expect(networkKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("leaves anything unparseable as it was", () => {
    expect(networkKey("not:an:address::at::all")).toBe("not:an:address::at::all");
  });
});

describe("addressBucket", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

  it("gives every address in one /64 the same bucket", () => {
    const one = addressBucket("t", request({ "cf-connecting-ip": "2001:db8:1:2::aaaa" }));
    const two = addressBucket("t", request({ "cf-connecting-ip": "2001:db8:1:2:dead:beef:0:1" }));
    expect(one).toBe(two);
  });

  it("prefers cf-connecting-ip over a client-supplied x-forwarded-for", () => {
    const headers = new Headers({ "cf-connecting-ip": "192.0.2.1", "x-forwarded-for": "198.51.100.9" });
    expect(clientAddress(headers)).toBe("192.0.2.1");
  });
});
