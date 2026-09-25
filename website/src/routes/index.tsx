import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardPreview } from "../components/dashboard-preview";
import { HarnessFrame } from "../components/harness-frame";
import { homeSeo } from "../lib/seo";

export const Route = createFileRoute("/")({
	head: () => ({ links: homeSeo.links }),
	component: Home,
});

const languageExamples = [
	{
		title: "Create an agent and a subagent",
		description:
			"Create @backend and its subagent @backend/tests, both using the current directory as their workspace.",
		input: "/create @backend .\n/create @backend/tests .",
	},
	{
		title: "Send one agent an instruction",
		description:
			"Put the agent’s name before the instruction to address it directly.",
		input: "@backend trace the authentication flow",
	},
	{
		title: "Send to several agents",
		description:
			"Put several names before the text to send the same instruction to each.",
		input: "@backend @backend/tests verify the fix",
	},
	{
		title: "Switch to an agent’s conversation",
		description:
			"Enter @backend/tests by itself to open that agent’s conversation. Keep working there without repeating its name.",
		input: "@backend/tests\nrun the API tests",
		demo: "focus",
	},
	{
		title: "See what is happening",
		description:
			"List agents and sessions, then narrow the view to active or waiting work.",
		input: "/list\n/active\n/waiting",
	},
	{
		title: "Attach an existing session",
		description:
			"Keep an Agentline name while attaching or detaching a session.",
		input: "/create @notes\n/attach @notes <session-id>\n/detach @notes",
	},
	{
		title: "Describe an agent",
		description:
			"Add a description to the name, or open the editor with the colon form.",
		input: "/describe @backend Owns the API\n: @backend",
	},
	{
		title: "Ask and request review",
		description:
			"Ask for an explanation or assign a named reviewer to an agent’s work.",
		input: "? @backend why this API?\n! @backend by @backend/tests",
	},
] as const;

function FocusDemo() {
	return (
		<HarnessFrame
			className="focus-terminal"
			label="workspace"
			role="img"
			aria-label="Agentline animation: enter @backend/tests to move into that agent’s conversation, then send run the API tests there."
		>
			<div className="focus-terminal-screen" aria-hidden="true">
				<div className="focus-terminal-overview">
					<div className="focus-terminal-view-title">agentline</div>
					<div className="focus-terminal-input">
						<span>›</span>
						<code>@backend/tests</code>
					</div>
				</div>
				<div className="focus-terminal-session">
					<div className="focus-terminal-view-title">
						<span>@backend/tests</span>
						<small>session</small>
					</div>
					<div className="focus-terminal-session-message">
						<small>you</small>
						<code>run the API tests</code>
					</div>
				</div>
			</div>
		</HarnessFrame>
	);
}

function Home() {
	return (
		<>
			<section className="hero container">
				<div className="hero-copy">
					<h1>
						A language for
						<br />
						<span>a world of agents.</span>
					</h1>
					<p className="hero-lede">
						The terminal is a natural place to direct agents: it’s where you
						already work through the keyboard. Agentline gives that work a
						language: name and address agents, inspect active sessions, route
						instructions, and request explanations or reviews.
					</p>
					<p className="hero-thesis">
						Agentline turns a plain terminal into a multi-agent workspace:
						direct agents, inspect active sessions, and follow conversations
						from one place—without a pane for every chat.
					</p>
					<div className="hero-actions">
						<a
							className="button button-quiet"
							href="https://github.com/tnspacetime/agentline"
							target="_blank"
							rel="noreferrer"
						>
							View source <span aria-hidden="true">↗</span>
						</a>
					</div>
				</div>
				<HarnessFrame className="hero-terminal" label="agentline">
					<div className="hero-terminal-screen">
						<span aria-hidden="true">› </span>
						<code>@frontend review the flow</code>
					</div>
					<p>Tell @frontend to review the flow.</p>
				</HarnessFrame>
			</section>

			<section className="section section-bordered container examples-section">
				<span className="section-index">EXAMPLES</span>
				<div className="examples-heading">
					<h2>See what you can say.</h2>
				</div>
				<div className="example-flow">
					{languageExamples.map((example) => (
						<article className="example-step" key={example.title}>
							<div className="example-explanation">
								<h3>{example.title}</h3>
								<p>{example.description}</p>
							</div>
							{"demo" in example ? (
								<FocusDemo />
							) : (
								<HarnessFrame
									className="example-frame"
									label="agentline"
									meta="input"
								>
									<pre>
										<code>{example.input}</code>
									</pre>
								</HarnessFrame>
							)}
						</article>
					))}
					<div className="example-step example-step-extension">
						<h3>More actions can be defined.</h3>
						<p>
							Agentline can add actions, views, and short forms as new ways of
							coordinating agents call for them.
						</p>
					</div>
				</div>
			</section>

			<section className="section section-bordered container syntax-teaser">
				<div className="syntax-teaser-copy">
					<span className="section-index">THE LANGUAGE</span>
					<h2>How Agentline works.</h2>
					<p>
						Agentline consists of two parts. System commands manage the working
						environment: agent names, sessions, and views. Agent actions direct
						those agents by switching conversations, sending instructions, and
						requesting explanations or reviews.
					</p>
					<p>
						Each agent action has an explicit full form and a shorter form for
						quick typing. For example, <code>.tell @backend fix the API</code>{" "}
						and <code>@backend fix the API</code> mean the same thing. The short
						form is syntactic sugar: it changes the spelling, not the action.
					</p>
					<Link className="text-link" to="/syntax">
						Read the syntax guide <span aria-hidden="true">→</span>
					</Link>
				</div>
				<HarnessFrame
					className="syntax-card"
					label="quick reference"
					meta="agent language"
				>
					<div className="syntax-row">
						<span className="syntax-key">/</span>
						<span>system command</span>
						<code>/create @backend .</code>
					</div>
					<div className="syntax-row">
						<span className="syntax-key">.</span>
						<span>full agent action</span>
						<code>.tell @backend fix the API</code>
					</div>
					<div className="syntax-row">
						<span className="syntax-key">@</span>
						<span>short agent action</span>
						<code>@backend fix the API</code>
					</div>
					<div className="syntax-row">
						<span className="syntax-key">?</span>
						<span>short for .explain</span>
						<code>? @backend why this API?</code>
					</div>
					<div className="syntax-row">
						<span className="syntax-key">!</span>
						<span>short for .review</span>
						<code>! @backend by @backend/tests</code>
					</div>
					<div className="syntax-row">
						<span className="syntax-key">:</span>
						<span>short for /describe</span>
						<code>: @backend</code>
					</div>
				</HarnessFrame>
			</section>

			<section className="section section-bordered container" id="direction">
				<div className="section-heading">
					<span className="section-index">WHAT THE LANGUAGE ENABLES</span>
					<h2>New possibilities for agent interfaces.</h2>
					<p>
						Agentline names agents, connects their sessions, and defines actions
						in one language. A UI built around that language can let you direct
						agents from one input, move among conversations, see active work,
						and follow several responses in a shared vertical feed.
					</p>
				</div>
				<DashboardPreview />
			</section>
		</>
	);
}
