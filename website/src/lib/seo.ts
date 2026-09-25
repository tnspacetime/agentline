const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(
	/\/$/,
	"",
);

const imagePath = "/og.png";
const imageUrl = siteUrl ? `${siteUrl}${imagePath}` : imagePath;
const imageAlt = "Agentline: a language for a world of agents";

export function seo({
	title,
	description,
	path,
}: {
	title: string;
	description: string;
	path: "/" | "/syntax/";
}) {
	const pageUrl = siteUrl ? `${siteUrl}${path}` : undefined;

	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			{ name: "twitter:image", content: imageUrl },
			{ name: "twitter:image:alt", content: imageAlt },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Agentline" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:image", content: imageUrl },
			{ property: "og:image:type", content: "image/png" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:image:alt", content: imageAlt },
			...(pageUrl ? [{ property: "og:url", content: pageUrl }] : []),
		],
		links: pageUrl ? [{ rel: "canonical", href: pageUrl }] : [],
	};
}

export const homeSeo = seo({
	title: "Agentline — a language for a world of agents",
	description:
		"A language for naming agents, routing work, and inspecting sessions from one input.",
	path: "/",
});
