import { createFileRoute } from "@tanstack/react-router";
import { HarnessFrame } from "../components/harness-frame";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/syntax")({
	head: () => ({
		...seo({
			title: "Syntax guide — Agentline",
			description:
				"The Agentline syntax guide: full forms, short forms, agents, sessions, and views.",
			path: "/syntax/",
		}),
	}),
	component: SyntaxGuide,
});

function Example({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<HarnessFrame className="example" label={label} meta="agentline input">
			<pre>
				<code>{children}</code>
			</pre>
		</HarnessFrame>
	);
}

function SyntaxGuide() {
	return (
		<div className="container guide-layout">
			<aside className="guide-sidebar" aria-label="Syntax guide sections">
				<div className="guide-sidebar-title">SYNTAX / INDEX</div>
				<a href="#overview">00 Overview</a>
				<a href="#forms">01 Full & short forms</a>
				<a href="#create">02 Names & subagents</a>
				<a href="#focus">03 Focus</a>
				<a href="#tell">04 Tell</a>
				<a href="#manage">05 Manage</a>
				<a href="#views">06 Views & search</a>
				<a href="#reference">07 Prefixes</a>
				<a href="#planned">08 Execution status</a>
			</aside>

			<article className="guide-content">
				<header className="guide-intro" id="overview">
					<h1>
						Syntax for moving
						<br />
						<span>between agents.</span>
					</h1>
					<p>
						Agentline proposes a shared syntax for naming agents, routing work,
						inspecting sessions, and requesting explanation or review. A slash
						manages identities and views; an <code>@name</code> addresses an
						agent; plain text follows focus.
					</p>
				</header>

				<section className="guide-section" id="forms">
					<div className="guide-section-head">
						<span>01 / FULL & SHORT FORMS</span>
						<h2>Two spellings. One action.</h2>
					</div>
					<p>
						The full forms name the action directly. The short forms are
						syntactic sugar: Agentline parses both spellings into the same
						action, so the shortcut does not change what gets sent.
					</p>
					<Example label="FULL ACTION SHAPES">
						{
							".focus <target>\n.tell <targets> <instruction>\n.explain <targets> [<question>]\n.review <targets> [.by <reviewer>]"
						}
					</Example>
					<div className="forms-table-wrap">
						<table
							className="forms-table"
							aria-label="Full forms and syntactic sugar"
						>
							<thead>
								<tr>
									<th>Meaning</th>
									<th>Full form</th>
									<th>Short form</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<th scope="row">Focus</th>
									<td>
										<code>.focus @frontend</code>
									</td>
									<td>
										<code>@frontend</code>
									</td>
								</tr>
								<tr>
									<th scope="row">Tell</th>
									<td>
										<code>.tell @frontend build the UI</code>
									</td>
									<td>
										<code>@frontend build the UI</code>
									</td>
								</tr>
								<tr>
									<th scope="row">Tell focused agent</th>
									<td>
										<code>.tell @frontend continue</code>
									</td>
									<td>
										<code>continue</code>
									</td>
								</tr>
								<tr>
									<th scope="row">Describe</th>
									<td>
										<code>/describe @frontend</code>
									</td>
									<td>
										<code>: @frontend</code>
									</td>
								</tr>
								<tr>
									<th scope="row">Explain</th>
									<td>
										<code>.explain @frontend why?</code>
									</td>
									<td>
										<code>? @frontend why?</code>
									</td>
								</tr>
								<tr>
									<th scope="row">Review</th>
									<td>
										<code>.review @frontend .by @tests</code>
									</td>
									<td>
										<code>! @frontend by @tests</code>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<p className="guide-small">
						A bare <code>@frontend</code> focuses. Add instruction text and it
						becomes a tell. Plain text alone tells the currently focused agent.
					</p>
				</section>

				<section className="guide-section" id="create">
					<div className="guide-section-head">
						<span>02 / CREATE</span>
						<h2>Name agents and subagents.</h2>
					</div>
					<p>
						A name can begin as a local identity for notes. In the OpenCode
						adapter, adding a directory creates and attaches a session. A dot
						means the current directory.
					</p>
					<Example label="LOCAL / ATTACHED">
						{"/create @notes\n/create @frontend ."}
					</Example>
					<p>
						A slash in the name marks one level of subagent. Create the parent
						first, then address the child with the same <code>@name</code>{" "}
						syntax. The name does not itself invoke a runtime’s subagent tool;
						with a directory, the OpenCode adapter gives the child its own
						session.
					</p>
					<Example label="PARENT / SUBAGENT">
						{
							"/create @backend .\n/create @backend/tests .\n@backend/tests run the API tests"
						}
					</Example>
				</section>

				<section className="guide-section" id="focus">
					<div className="guide-section-head">
						<span>03 / FOCUS</span>
						<h2>Choose where text goes.</h2>
					</div>
					<p>
						Type an agent’s name alone, or use the explicit action, to make that
						agent’s conversation the active view. You can keep working there
						without repeating its name.
					</p>
					<Example label="SHORT / EXPLICIT">
						{"@frontend\n.focus @frontend\ncontinue the implementation"}
					</Example>
				</section>

				<section className="guide-section" id="tell">
					<div className="guide-section-head">
						<span>04 / TELL</span>
						<h2>Send to one or many.</h2>
					</div>
					<p>
						Put one or more targets before an instruction. Agentline resolves
						every name before sending anything, then records each delivery
						separately.
					</p>
					<Example label="SINGLE / BROADCAST">
						{
							"@frontend build the navigation\n@frontend @tests check the keyboard flow\n.tell @frontend @tests check the keyboard flow"
						}
					</Example>
				</section>

				<section className="guide-section" id="manage">
					<div className="guide-section-head">
						<span>05 / MANAGE</span>
						<h2>Keep identities flexible.</h2>
					</div>
					<p>
						Descriptions belong to the agent identity. The OpenCode adapter can
						attach an existing session to a local identity, or detach it without
						deleting the session.
					</p>
					<Example label="DESCRIPTION / SESSION">
						{
							"/describe @frontend Owns navigation work\n: @frontend\n/attach @notes <session-id>\n/detach @notes"
						}
					</Example>
					<p className="guide-small">
						In the OpenCode reference implementation, <code>/agentline</code>
						opens the Agentline view.
					</p>
				</section>

				<section className="guide-section" id="views">
					<div className="guide-section-head">
						<span>06 / VIEWS & SEARCH</span>
						<h2>Inspect the work.</h2>
					</div>
					<p>
						The language also names queries. List agents and sessions, inspect
						active or waiting work, look up changes or errors, and search by
						text.
					</p>
					<Example label="LIST / STATUS / FIND">
						{
							"/list\n/active\n/waiting\n/changed @backend\n/errors\n/search authentication"
						}
					</Example>
				</section>

				<section className="guide-section" id="reference">
					<div className="guide-section-head">
						<span>07 / PREFIXES</span>
						<h2>Read the first character.</h2>
					</div>
					<table
						className="reference-table"
						aria-label="Agentline input prefixes"
					>
						<tbody>
							<tr>
								<th scope="row">
									<code>/</code>
								</th>
								<td>System command</td>
								<td>Manage identities or query Agentline views</td>
							</tr>
							<tr>
								<th scope="row">
									<code>@</code>
								</th>
								<td>Targeted short form</td>
								<td>Focus one agent or send an instruction</td>
							</tr>
							<tr>
								<th scope="row">
									<code>.</code>
								</th>
								<td>Explicit action</td>
								<td>
									For example, <code>.focus</code> or <code>.tell</code>
								</td>
							</tr>
							<tr>
								<th scope="row">
									<code>:</code>
								</th>
								<td>Description shortcut</td>
								<td>Edit an agent description</td>
							</tr>
							<tr>
								<th scope="row">
									<code>?</code>
								</th>
								<td>Explain shortcut</td>
								<td>Request an explanation from an agent</td>
							</tr>
							<tr>
								<th scope="row">
									<code>!</code>
								</th>
								<td>Review shortcut</td>
								<td>Request a review of an agent’s work</td>
							</tr>
							<tr>
								<th scope="row">
									<code>text</code>
								</th>
								<td>Implicit instruction</td>
								<td>Send to the focused agent</td>
							</tr>
						</tbody>
					</table>
				</section>

				<section className="guide-section guide-planned" id="planned">
					<div className="guide-section-head">
						<span>08 / EXECUTION STATUS</span>
						<h2>OpenCode reference implementation.</h2>
					</div>
					<p>
						OpenCode currently executes create, attach, detach, describe, focus,
						tell, local notes, and broadcast. <code>.explain</code>,{" "}
						<code>.review</code>, and additional views are part of the language
						but are not yet executed by this reference implementation.
					</p>
				</section>
			</article>
		</div>
	);
}
