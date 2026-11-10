import type {
  AnalysisJob,
  AnalysisSubmission,
  CompletedAnalysisReport,
} from "../domain/contracts";
export class AnalysisUnavailableError extends Error {
  constructor() {
    super(
      "The video-analysis engine is not connected. Your footage has not been uploaded or analyzed. Your setup is preserved; you can continue when a verified backend is integrated.",
    );
    this.name = "AnalysisUnavailableError";
  }
}
/** Provider-independent boundary. The server adapter must validate both jobs and reports.
 * No provider credentials belong in the browser. See docs/ENGINE-INTEGRATION.md.
 */
export interface AnalysisService {
  capabilities: {
    available: boolean;
    upload: boolean;
    cancel: boolean;
    tracking: boolean;
  };
  submit(
    input: AnalysisSubmission,
    signal?: AbortSignal,
    onUploadStart?: () => void,
    onJobUpdate?: (job: AnalysisJob) => void,
  ): Promise<AnalysisJob>;
  status(id: string, signal?: AbortSignal): Promise<AnalysisJob>;
  report(id: string, signal?: AbortSignal): Promise<CompletedAnalysisReport>;
  cancel(id: string): Promise<void>;
  list(): Promise<CompletedAnalysisReport[]>;
  get(id: string): Promise<CompletedAnalysisReport>;
}
export const analysisService: AnalysisService = {
  capabilities: {
    available: false,
    upload: false,
    cancel: false,
    tracking: false,
  },
  async submit() {
    throw new AnalysisUnavailableError();
  },
  async status() {
    throw new AnalysisUnavailableError();
  },
  async report() {
    throw new AnalysisUnavailableError();
  },
  async cancel() {
    throw new AnalysisUnavailableError();
  },
  async list() {
    throw new AnalysisUnavailableError();
  },
  async get() {
    throw new AnalysisUnavailableError();
  },
};

export { connectAnalysisService } from "./httpAnalysis";
