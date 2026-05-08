const AnalysisHeader = ({ overline, title, subtitle, right }) => {
  return (
    <header className="w-full pb-2">
      <div className="flex flex-wrap items-start justify-between gap-1">
        <div className="flex min-w-[220px] flex-col items-start text-left">
          {overline && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] leading-none text-muted-foreground">
              {overline}
            </p>
          )}
          <h1 className="mt-0 text-xl font-semibold leading-none text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0 text-xs leading-none text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex flex-1 justify-end">
          {right}
        </div>
      </div>
    </header>
  );
};

export default AnalysisHeader;
