"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { attributionQuery, readAttribution } from "@/lib/analytics/attribution";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Link to /login that carries the visitor's first touch (UTM parameters,
 * referring host, landing path) as query parameters — no cookie, no
 * browser storage. Static pages render a plain "/login" link; the
 * attribution is added after mount from what this request already knows.
 */
export function SignupLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  const [href, setHref] = useState("/login");

  useMountEffect(() => {
    const query = attributionQuery(
      readAttribution({
        search: window.location.search,
        referrer: document.referrer,
        ownHost: window.location.host,
        pathname: window.location.pathname,
      }),
    );
    if (query) setHref(`/login?${query}`);
  });

  return <Link {...props} href={href} />;
}
