type HarnessFrameProps = React.HTMLAttributes<HTMLDivElement> & {
	label: string;
	meta?: string;
};

export function HarnessFrame({
	label,
	meta,
	children,
	className = "",
	...props
}: HarnessFrameProps) {
	return (
		<div className={`harness-frame ${className}`.trim()} {...props}>
			<div className="harness-frame-bar">
				<span className="harness-frame-mark" aria-hidden="true">
					›_
				</span>
				<span className="harness-frame-label">{label}</span>
				{meta && <span className="harness-frame-meta">{meta}</span>}
			</div>
			{children}
		</div>
	);
}
