package com.mauzohalisi.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.Charset;

/**
 * Turns receipt text into ESC/POS bytes.
 *
 * Thermal printers are fixed-width character devices, not page printers: a 58mm
 * roll fits 32 characters per line at font A, an 80mm roll 48. Text wider than
 * that is silently truncated by the printer, which is how a total ends up
 * missing its last digit, so wrapping is done here instead.
 */
final class EscPos {

    static final int WIDTH_58MM = 32;
    static final int WIDTH_80MM = 48;

    private static final byte[] INIT        = { 0x1B, 0x40 };
    private static final byte[] ALIGN_LEFT  = { 0x1B, 0x61, 0x00 };
    private static final byte[] ALIGN_CENTR = { 0x1B, 0x61, 0x01 };
    private static final byte[] BOLD_ON     = { 0x1B, 0x45, 0x01 };
    private static final byte[] BOLD_OFF    = { 0x1B, 0x45, 0x00 };
    private static final byte[] FEED_CUT    = { 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00 };

    /**
     * Code page 437. Latin-1 is the safe default for these printers; anything
     * outside it (a Swahili name is fine, but a smart quote pasted from a phone
     * keyboard is not) would otherwise print as a random glyph.
     */
    private static final Charset ENCODING = Charset.forName("ISO-8859-1");

    private EscPos() {}

    static byte[] receipt(String text, int width) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(INIT);
        out.write(ALIGN_LEFT);

        String[] lines = text.replace("\r\n", "\n").split("\n");
        int heading = firstNonEmpty(lines);

        for (int i = 0; i < lines.length; i++) {
            boolean isHeading = i == heading;
            if (isHeading) { out.write(ALIGN_CENTR); out.write(BOLD_ON); }

            for (String printed : layout(normalise(lines[i]), width)) {
                out.write(printed.getBytes(ENCODING));
                out.write('\n');
            }

            if (isHeading) { out.write(BOLD_OFF); out.write(ALIGN_LEFT); }
        }

        out.write(FEED_CUT);
        return out.toByteArray();
    }

    /**
     * Lay one source line out across the paper width.
     *
     * The receipt is an HTML table, and innerText separates cells with tabs, so
     * a line arrives as "Sukari 1kg\t2 kg\tA\t6,000" rather than as prose. The
     * last cell is the amount and belongs hard against the right margin; wrapping
     * the row as if it were a sentence pushes that amount onto a line of its own,
     * which is how a receipt ends up with a column of orphaned numbers.
     */
    private static java.util.List<String> layout(String line, int width) {
        java.util.List<String> out = new java.util.ArrayList<>();

        if (line.indexOf('\t') < 0) {           // no columns: plain text
            out.addAll(wrap(line.trim(), width));
            return out;
        }

        String[] cells = line.split("\t");
        java.util.List<String> parts = new java.util.ArrayList<>();
        for (String c : cells) { c = c.trim(); if (!c.isEmpty()) parts.add(c); }
        if (parts.isEmpty()) { out.add(""); return out; }
        if (parts.size() == 1) { out.addAll(wrap(parts.get(0), width)); return out; }

        String right = parts.remove(parts.size() - 1);
        String left  = String.join(" ", parts);

        // One line when it fits, dots of padding between the two columns.
        if (left.length() + 1 + right.length() <= width) {
            out.add(left + repeat(' ', width - left.length() - right.length()) + right);
            return out;
        }

        // Otherwise the description takes as many lines as it needs and the
        // amount sits right-aligned on the last of them, or on its own line if
        // even that will not fit.
        java.util.List<String> wrapped = wrap(left, width);
        String last = wrapped.remove(wrapped.size() - 1);
        out.addAll(wrapped);
        if (last.length() + 1 + right.length() <= width) {
            out.add(last + repeat(' ', width - last.length() - right.length()) + right);
        } else {
            out.add(last);
            out.add(repeat(' ', Math.max(0, width - right.length())) + right);
        }
        return out;
    }

    private static String repeat(char c, int n) {
        if (n <= 0) return "";
        StringBuilder b = new StringBuilder(n);
        for (int i = 0; i < n; i++) b.append(c);
        return b.toString();
    }

    private static int firstNonEmpty(String[] lines) {
        for (int i = 0; i < lines.length; i++) if (!lines[i].trim().isEmpty()) return i;
        return -1;
    }

    /**
     * Fold the characters a phone keyboard produces but a thermal printer cannot
     * render, rather than letting them come out as noise.
     */
    private static String normalise(String s) {
        return s
            .replace('‘', '\'').replace('’', '\'')
            .replace('“', '"').replace('”', '"')
            .replace('–', '-').replace('—', '-')
            .replace(' ', ' ')
            .replace("…", "...");
    }

    /** Wrap on spaces where possible, hard-break a word that cannot fit. */
    private static java.util.List<String> wrap(String line, int width) {
        java.util.List<String> out = new java.util.ArrayList<>();
        if (line.isEmpty()) { out.add(""); return out; }

        StringBuilder current = new StringBuilder();
        for (String word : line.split(" ")) {
            while (word.length() > width) {
                if (current.length() > 0) { out.add(current.toString()); current.setLength(0); }
                out.add(word.substring(0, width));
                word = word.substring(width);
            }
            if (current.length() == 0) {
                current.append(word);
            } else if (current.length() + 1 + word.length() <= width) {
                current.append(' ').append(word);
            } else {
                out.add(current.toString());
                current.setLength(0);
                current.append(word);
            }
        }
        if (current.length() > 0) out.add(current.toString());
        return out;
    }
}
