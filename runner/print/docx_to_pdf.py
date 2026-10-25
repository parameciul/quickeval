"""Make a PDF from a Word document with the LibreOffice of the print image.

Runs inside the print image (runner/print/Dockerfile), where soffice is on PATH.
Usage: python3 /app/docx_to_pdf.py SOURCE.docx -o OUT.pdf

Converts with a private profile under the temp folder, so a stale profile cannot
break a run, and moves the result to -o.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CONVERT_TIMEOUT = 60


def profile_dir():
    # A persistent private profile: a LibreOffice window the teacher already
    # has open cannot block the run, and font subsetting stays identical from
    # one run to the next (a fresh profile embeds different subsets each
    # time, so the committed PDF would never be byte-identical). Per machine,
    # outside the repo: nothing to commit, nothing to clean.
    return Path(tempfile.gettempdir()) / 'quickeval-docx-to-pdf-profile'


def find_soffice():
    env = os.environ.get('SOFFICE')
    if env and Path(env).is_file():
        return env
    found = shutil.which('soffice')
    if found:
        return found
    candidates = [
        Path(r'C:\Program Files\LibreOffice\program\soffice.exe'),
        Path(r'C:\Program Files (x86)\LibreOffice\program\soffice.exe'),
        Path('/usr/bin/soffice'),
        Path('/usr/bin/libreoffice'),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def convert(source, output, soffice=None, timeout=CONVERT_TIMEOUT):
    """Convert source DOCX to output PDF. Returns the output path."""
    exe = soffice or find_soffice()
    if not exe:
        raise FileNotFoundError(
            'LibreOffice not found. Install it: winget install --id TheDocumentFoundation.LibreOffice'
        )
    source = Path(source)
    output = Path(output)
    attempts = [profile_dir(), None]  # persistent profile, then a fresh one
    last_error = None
    for profile in attempts:
        with tempfile.TemporaryDirectory(prefix='docx-to-pdf-') as tmp:
            # A private profile: a LibreOffice window the teacher already has
            # open cannot block the run. Forward slashes: the file:/// URL
            # needs them also on Windows.
            if profile is None:
                profile_arg = (Path(tmp) / 'loprofile').as_posix()
            else:
                profile.mkdir(parents=True, exist_ok=True)
                profile_arg = profile.as_posix()
            cmd = [
                exe,
                '-env:UserInstallation=file:///' + profile_arg.lstrip('/'),
                '--headless',
                '--norestore',
                '--convert-to', 'pdf',
                '--outdir', tmp,
                str(source),
            ]
            try:
                result = subprocess.run(
                    cmd, capture_output=True, text=True, encoding='utf-8', timeout=timeout
                )
            except subprocess.TimeoutExpired:
                raise TimeoutError(f'conversion timed out after {timeout}s: {source}')
            if result.returncode != 0:
                detail = (result.stdout + result.stderr).strip()
                last_error = f'conversion failed for {source}: {detail}'
                continue  # retry once with a fresh profile (a stale one breaks after upgrades)
            made = Path(tmp) / (source.stem + '.pdf')
            if not made.is_file():
                last_error = f'conversion produced no PDF for {source}'
                continue
            output.parent.mkdir(parents=True, exist_ok=True)
            # Move out of the temp folder before it is removed (shutil: the temp
            # folder may live on another drive than the output).
            shutil.move(str(made), str(output))
            return output
    raise RuntimeError(last_error)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Make a PDF from a Word document with LibreOffice.')
    parser.add_argument('source')
    parser.add_argument('-o', '--output', required=True)
    args = parser.parse_args(argv)
    if not Path(args.source).is_file():
        print(f'ERROR: {args.source} does not exist', file=sys.stderr)
        return 1
    try:
        convert(args.source, args.output)
    except FileNotFoundError as error:
        print(str(error), file=sys.stderr)
        return 1
    except TimeoutError as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1
    except (RuntimeError, OSError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1
    print(f'written {args.output}')
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    sys.exit(main())
