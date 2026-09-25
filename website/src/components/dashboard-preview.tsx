import { useEffect, useRef, useState } from "react";
import { HarnessFrame } from "./harness-frame";

const exchanges = [
	{
		agent: "frontend",
		request: "Build the navigation and check the focus order.",
		response: "Navigation is in place. Checking the keyboard path now.",
	},
	{
		agent: "tests",
		request: "Check the new keyboard flow.",
		response: "Running through the tab order and screen reader labels.",
	},
	{
		agent: "docs",
		request: "Document the new navigation behavior.",
		response: "Adding the keyboard steps to the guide.",
	},
] as const;

export function DashboardPreview() {
	const demoRef = useRef<HTMLDivElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);

	useEffect(() => {
		const demo = demoRef.current;
		if (!demo) return;
		if (!("IntersectionObserver" in window)) {
			setIsPlaying(true);
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsPlaying(true);
					observer.disconnect();
				}
			},
			{ threshold: 0.2 },
		);
		observer.observe(demo);
		return () => observer.disconnect();
	}, []);

	return (
		<div className="hero-visual" ref={demoRef}>
			<HarnessFrame
				className={`terminal-window dashboard-window${isPlaying ? " is-playing" : ""}`}
				label="agentline / shared response feed"
				meta="concept"
				aria-hidden="true"
			>
				<div className="dashboard-progress" />

				<div className="dashboard-main">
					<div className="dashboard-title">
						<strong>Agent responses</strong>
						<span>one feed</span>
						<small>/agentline</small>
					</div>
					<div className="dashboard-conversations">
						<div className="dashboard-empty">Awaiting agent responses_</div>
						{exchanges.map((exchange, index) => (
							<div
								className={`dashboard-chat dashboard-chat-${index + 1}`}
								key={exchange.agent}
							>
								<div className="dashboard-chat-head">
									<strong>@{exchange.agent}</strong>
									<span className="dashboard-status">
										<span className="dashboard-status-working">
											● responding
										</span>
										<span className="dashboard-status-done">✓ done</span>
									</span>
								</div>
								<div className="dashboard-chat-body">
									<div className="dashboard-request">
										<small>YOU → @{exchange.agent}</small>
										<span>{exchange.request}</span>
									</div>
									<div
										className={`dashboard-answer dashboard-answer-${index + 1}`}
									>
										<small>@{exchange.agent.toUpperCase()}</small>
										<span>{exchange.response}</span>
									</div>
								</div>
							</div>
						))}
					</div>
					<div className="dashboard-input">
						<span className="prompt">❯</span>
						<span className="dashboard-command dashboard-command-1">
							@frontend build the navigation
						</span>
						<span className="dashboard-command dashboard-command-2">
							@tests check the keyboard flow
						</span>
						<span className="dashboard-command dashboard-command-3">
							@docs document the navigation
						</span>
						<span className="dashboard-command dashboard-command-idle">
							address an agent…
						</span>
					</div>
				</div>

				<div className="terminal-status">
					<span>ONE INPUT · MULTIPLE AGENTS · ONE FEED</span>
					<span>CONCEPT VIEW</span>
				</div>
			</HarnessFrame>
		</div>
	);
}
