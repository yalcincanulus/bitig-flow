export default function ViewerPdf({ pageCount }: { pageCount: number | null }) {
  if (pageCount === null) return null;

  return (
    <p className="mt-3 text-base text-muted-foreground">
      {pageCount} {pageCount === 1 ? "page" : "pages"}
    </p>
  );
}
