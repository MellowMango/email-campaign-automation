import { apiClient } from '../lib/api/client';
import { PaginatedResponse, PaginationParams } from '../lib/types/api';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface CreateCampaignData {
  name: string;
  description?: string;
}

export interface UpdateCampaignData {
  name?: string;
  description?: string;
  status?: Campaign['status'];
}

export class CampaignService {
  private static instance: CampaignService;
  private readonly baseEndpoint = '/campaigns';

  private constructor() {}

  static getInstance(): CampaignService {
    if (!this.instance) {
      this.instance = new CampaignService();
    }
    return this.instance;
  }

  async getCampaigns(params?: PaginationParams): Promise<PaginatedResponse<Campaign>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.sortBy) queryParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder);

    const endpoint = `${this.baseEndpoint}?${queryParams.toString()}`;
    return apiClient.get<PaginatedResponse<Campaign>>(endpoint);
  }

  async getCampaign(id: string): Promise<Campaign> {
    return apiClient.get<Campaign>(`${this.baseEndpoint}/${id}`);
  }

  async createCampaign(data: CreateCampaignData): Promise<Campaign> {
    return apiClient.post<Campaign>(this.baseEndpoint, data);
  }

  async updateCampaign(id: string, data: UpdateCampaignData): Promise<Campaign> {
    return apiClient.put<Campaign>(`${this.baseEndpoint}/${id}`, data);
  }

  async deleteCampaign(id: string): Promise<void> {
    return apiClient.delete<void>(`${this.baseEndpoint}/${id}`);
  }

  // Example of using custom configuration
  async duplicateCampaign(id: string): Promise<Campaign> {
    return apiClient.post<Campaign>(
      `${this.baseEndpoint}/${id}/duplicate`,
      {},
      {
        timeout: 30000, // Longer timeout for potentially lengthy operation
        retries: 2, // Fewer retries for idempotent operation
      }
    );
  }
}

// Export a singleton instance
export const campaignService = CampaignService.getInstance(); 