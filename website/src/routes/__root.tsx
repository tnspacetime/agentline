import {
	createRootRoute,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { homeSeo } from "../lib/seo";

import appCss from "../styles.css?url";

const sourceUrl = "https://github.com/tnspacetime/agentline";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ name: "theme-color", content: "#0b0f10" },
			...homeSeo.meta,
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="site-shell">
					<header className="site-header">
						<div className="container header-inner">
							<Link to="/" className="brand" aria-label="Agentline home">
								<span className="brand-glyph" aria-hidden="true">
									&gt;_
								</span>
								<span>agentline</span>
							</Link>
							<nav className="site-nav" aria-label="Main navigation">
								<Link
									to="/"
									activeProps={{ className: "nav-item active" }}
									className="nav-item"
								>
									Overview
								</Link>
								<Link
									to="/syntax"
									activeProps={{ className: "nav-item active" }}
									className="nav-item"
								>
									Syntax
								</Link>
								<a
									className="nav-item nav-source"
									href={sourceUrl}
									target="_blank"
									rel="noreferrer"
								>
									Source <span aria-hidden="true">↗</span>
								</a>
							</nav>
						</div>
					</header>

					<main id="content">{children}</main>

					<footer className="site-footer">
						<div className="container footer-inner">
							<span>
								<span className="footer-prompt" aria-hidden="true">
									&gt;
								</span>{" "}
								agentline / built in the open
							</span>
							<div className="footer-links">
								<Link to="/syntax">Syntax guide</Link>
								<a href={sourceUrl} target="_blank" rel="noreferrer">
									GitHub ↗
								</a>
							</div>
						</div>
					</footer>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
