import { describe, expect, it } from "vitest";
import { buildRoomPhotoPath, isCanonicalRoomPhotoPath, parseRoomPhotoPath, sanitizeOriginalFilename } from "./path";

const PROJECT_ID = "2cc85a10-1111-4111-8111-abcdef000001";
const UPLOAD_ID = "90e41b20-2222-4222-8222-abcdef000002";

describe("room photo storage paths", () => {
  it("builds the canonical project-scoped path", () => {
    expect(buildRoomPhotoPath(PROJECT_ID, UPLOAD_ID, "image/jpeg")).toBe(
      `projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg`
    );
  });

  it("parses a valid path", () => {
    const parsed = parseRoomPhotoPath(
      `projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.png`
    );
    expect(parsed?.projectId).toBe(PROJECT_ID);
    expect(parsed?.uploadId).toBe(UPLOAD_ID);
    expect(parsed?.ext).toBe("png");
  });

  it("rejects path traversal and extra folders", () => {
    expect(
      parseRoomPhotoPath(
        `projects/${PROJECT_ID}/uploads/../../etc/passwd`
      )
    ).toBeNull();
    expect(
      parseRoomPhotoPath(`projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg/extra`)
    ).toBeNull();
    expect(
      parseRoomPhotoPath(`other/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg`)
    ).toBeNull();
    expect(parseRoomPhotoPath(`projects/${PROJECT_ID}/${UPLOAD_ID}.jpg`)).toBeNull();
    expect(
      parseRoomPhotoPath(`projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.svg`)
    ).toBeNull();
    expect(parseRoomPhotoPath(`/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg`)).toBeNull();
  });

  it("does not treat another project's path as canonical", () => {
    const other = "3dd96b21-3333-4333-8333-abcdef000003";
    expect(
      isCanonicalRoomPhotoPath(
        `projects/${other}/uploads/${UPLOAD_ID}.jpg`,
        { projectId: PROJECT_ID, uploadId: UPLOAD_ID }
      )
    ).toBe(false);
  });

  it("sanitizes original filenames without using them as keys", () => {
    expect(sanitizeOriginalFilename("../../secret.jpg", "jpg")).toBe("secret.jpg");
  });
});
