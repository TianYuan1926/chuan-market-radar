"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TradingViewWidgetConstructor = new (options: Record<string, unknown>) => unknown;

declare global {
  interface Window {
    TradingView?: {
      widget: TradingViewWidgetConstructor;
    };
  }
}

type TradingViewEmbedProps = {
  interval: string;
  symbol: string;
};

const tradingViewScriptId = "tradingview-widget-script";

function widgetContainerId(symbol: string, interval: string) {
  return `tv-${symbol}-${interval}`.replace(/[^a-z0-9_-]/giu, "-").toLowerCase();
}

export function TradingViewEmbed({ interval, symbol }: TradingViewEmbedProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"error" | "loading" | "ready">("loading");
  const containerId = useMemo(() => widgetContainerId(symbol, interval), [interval, symbol]);

  useEffect(() => {
    let cancelled = false;
    const hostElement = hostRef.current;
    const failSafeTimer = window.setTimeout(() => {
      if (!cancelled && !window.TradingView?.widget) {
        setStatus("error");
      }
    }, 8000);

    function mountWidget() {
      if (cancelled || !hostElement || !window.TradingView?.widget) {
        return;
      }

      window.clearTimeout(failSafeTimer);
      hostElement.innerHTML = `<div id="${containerId}" class="tradingview-widget-slot"></div>`;

      new window.TradingView.widget({
        allow_symbol_change: true,
        autosize: true,
        calendar: false,
        container_id: containerId,
        details: false,
        enable_publishing: false,
        hide_legend: false,
        hide_side_toolbar: false,
        hotlist: false,
        interval,
        locale: "zh_CN",
        save_image: false,
        studies: ["Volume@tv-basicstudies"],
        style: "1",
        symbol,
        theme: "light",
        timezone: "Asia/Shanghai",
        toolbar_bg: "#f3f8ff",
        withdateranges: true,
      });

      setStatus("ready");
    }

    if (window.TradingView?.widget) {
      mountWidget();

      return () => {
        cancelled = true;
        window.clearTimeout(failSafeTimer);
        if (hostElement) {
          hostElement.innerHTML = "";
        }
      };
    }

    let script = document.getElementById(tradingViewScriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.async = true;
      script.id = tradingViewScriptId;
      script.src = "https://s3.tradingview.com/tv.js";
      document.head.appendChild(script);
    }

    const handleLoad = () => {
      if (script) {
        script.dataset.loaded = "true";
      }
      mountWidget();
    };
    const handleError = () => {
      if (!cancelled) {
        setStatus("error");
      }
    };

    if (script.dataset.loaded === "true") {
      window.setTimeout(mountWidget, 0);
    } else {
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(failSafeTimer);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);

      if (hostElement) {
        hostElement.innerHTML = "";
      }
    };
  }, [containerId, interval, symbol]);

  return (
    <div className={`tradingview-embed tradingview-embed--${status}`}>
      <div className="tradingview-embed__host" ref={hostRef} />
      {status !== "ready" ? (
        <div className="tradingview-embed__status">
          <b>{status === "error" ? "TradingView 加载失败" : "正在加载 TradingView"}</b>
          <span>{status === "error" ? "可先使用右上角外链打开实时图。" : `${symbol} · ${interval}`}</span>
        </div>
      ) : null}
    </div>
  );
}
