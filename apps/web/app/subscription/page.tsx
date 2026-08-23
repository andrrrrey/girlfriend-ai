"use client";

import React from "react";
import { useT } from "../../context/language";
import SubscriptionBlock, { SubscriptionBlockStyles } from "../components/SubscriptionBlock";

const CSS = `
.sub-page {
  padding: 24px 32px;
  max-width: 900px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  font-family: 'Syne', sans-serif;
  color: #fff;
}
.sub-page-head {
  padding-bottom: 24px;
  border-bottom: 1px solid #252525;
  margin-bottom: 24px;
}
.sub-page-title {
  font-size: 28px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1.1; color: #fff; margin: 0;
}
.sub-page-sub {
  font-size: 13px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #969696; margin-top: 8px; line-height: 1.5;
}
@media (max-width: 768px) { .sub-page { padding: 16px; } }
`;

export default function SubscriptionPage() {
  const { t } = useT();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SubscriptionBlockStyles />
      <div className="sub-page">
        <div className="sub-page-head">
          <h1 className="sub-page-title">{t("topnav.subscription")}</h1>
          <div className="sub-page-sub">{t("sub.pageSubtitle")}</div>
        </div>
        <SubscriptionBlock />
      </div>
    </>
  );
}
