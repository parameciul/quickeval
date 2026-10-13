import { useState } from 'react';
import type { StudentResultView } from '../../shared/api.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { formatFileSize, pointsLevel } from '../ui/format.ts';
import { resultFileUrl } from './api.ts';

// One student's result page: the grade, the points and comments per exercise,
// and the final words. Read-only: the only button shows or hides the files.
// Nothing here tells how the work was graded.
export function StudentResult({ result, resultToken }: { result: StudentResultView; resultToken: string }) {
  const [filesOpen, setFilesOpen] = useState(false);
  const evaluation = result.evaluation;
  return (
    <section>
      <h1>{result.studentName}</h1>
      <p className="hint">
        {result.testTitle} · {result.testCode}
      </p>
      <div className="files-head">
        <h2>Fișiere ({result.files.length})</h2>
        <button type="button" className="button-quiet button-small" aria-expanded={filesOpen} onClick={() => setFilesOpen(!filesOpen)}>
          {filesOpen ? 'Ascunde fișierele' : 'Arată fișierele'}
        </button>
      </div>
      {filesOpen && <ResultFiles result={result} resultToken={resultToken} />}
      {evaluation ? (
        <>
          <h2>Rezultatul tău</h2>
          <p className="grade-line">
            Nota <strong className={`points points-${pointsLevel(evaluation.grade, 10)}`}>{formatPoints(evaluation.grade)}</strong> ·{' '}
            {formatPoints(evaluation.total)} puncte din {formatPoints(evaluation.maxTotal)}
            {evaluation.officePoints > 0 && `, cu ${formatPoints(evaluation.officePoints)} din oficiu`}
          </p>
          <div className="table-wrap">
            <table className="items">
              <caption className="sr-only">Punctajele pe exerciții</caption>
              <thead>
                <tr>
                  <th scope="col">Exercițiul</th>
                  <th scope="col">Puncte</th>
                  <th scope="col">Răspunsul tău</th>
                  <th scope="col">Comentariu</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.items.map((item) => (
                  <tr key={item.exerciseId}>
                    <th scope="row">{item.label}</th>
                    <td data-label="Puncte">
                      <span className={`points points-${pointsLevel(item.points, item.maxPoints)}`}>
                        {formatPoints(item.points)} din {formatPoints(item.maxPoints)}
                      </span>
                    </td>
                    <td data-label="Răspunsul tău">{item.studentAnswer}</td>
                    <td data-label="Comentariu">{item.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section aria-label="Rezumat">
            <h3>Rezumat</h3>
            <p>{evaluation.summary}</p>
          </section>
          {evaluation.strengths.length > 0 && (
            <section aria-label="Ce ai lucrat bine">
              <h3>Ce ai lucrat bine</h3>
              <ul>
                {evaluation.strengths.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </section>
          )}
          {evaluation.recommendations.length > 0 && (
            <section aria-label="Recomandări">
              <h3>Recomandări</h3>
              <ul>
                {evaluation.recommendations.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p role="status">Rezultatul tău nu este gata încă. Revino mai târziu pe acest link.</p>
      )}
    </section>
  );
}

function ResultFiles({ result, resultToken }: { result: StudentResultView; resultToken: string }) {
  if (result.files.length === 0) return <p className="hint">Nu ai încă niciun fișier aici.</p>;
  return (
    <ol className="page-files">
      {result.files.map((file, index) => {
        const url = resultFileUrl(resultToken, file.id);
        const caption = `Pagina ${index + 1}: ${file.name} · ${formatFileSize(file.size)}`;
        if (file.contentType.startsWith('image/')) {
          return (
            <li key={file.id}>
              <a href={url} target="_blank" rel="noopener">
                <img src={url} alt={`Pagina ${index + 1}`} loading="lazy" />
              </a>
              <p className="hint">{caption}</p>
            </li>
          );
        }
        return (
          <li key={file.id}>
            <iframe className="pdf-frame" src={url} title={`Pagina ${index + 1}`} loading="lazy" />
            <a href={url} target="_blank" rel="noopener">
              Deschide PDF-ul
            </a>
            <p className="hint">{caption}</p>
          </li>
        );
      })}
    </ol>
  );
}
