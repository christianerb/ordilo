"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { attributionQuery } from "@/lib/analytics/attribution";
import { captureFirstTouch } from "@/lib/analytics/first-touch";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Link to /login that carries the visitor's first touch (UTM parameters,
 * referring host, landing path) as query parameters — no cookie, no
 * browser storage. Static pages render a plain "/login" link; the
 * attribution is added after mount, so it also survives a full page load
 * of /login (new tab, no client-side navigation).
 */
export function SignupLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  const [href, setHref] = useState("/login");

  useMountEffect(() => {
    const query = attributionQuery(captureFirstTouch());
    if (query) setHref(`/login?${query}`);
  });

  return <Link {...props} href={href} />;
}
