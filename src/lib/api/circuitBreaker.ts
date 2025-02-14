interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class CircuitBreaker {
  private static instance: CircuitBreaker;
  private circuits: Map<string, CircuitState> = new Map();
  private readonly defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
  };

  private constructor() {
    // Periodically check and reset circuits
    setInterval(() => this.checkCircuits(), 30000);
  }

  static getInstance(): CircuitBreaker {
    if (!this.instance) {
      this.instance = new CircuitBreaker();
    }
    return this.instance;
  }

  async execute<T>(
    endpoint: string,
    operation: () => Promise<T>,
    config: Partial<CircuitBreakerConfig> = {}
  ): Promise<T> {
    const { failureThreshold, resetTimeout } = {
      ...this.defaultConfig,
      ...config,
    };

    const circuit = this.getCircuit(endpoint);

    if (circuit.status === 'OPEN') {
      if (Date.now() - circuit.lastFailure >= resetTimeout) {
        circuit.status = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker is open for ${endpoint}`);
      }
    }

    try {
      const result = await operation();
      if (circuit.status === 'HALF_OPEN') {
        this.resetCircuit(endpoint);
      }
      return result;
    } catch (error) {
      this.recordFailure(endpoint, failureThreshold);
      throw error;
    }
  }

  private getCircuit(endpoint: string): CircuitState {
    if (!this.circuits.has(endpoint)) {
      this.circuits.set(endpoint, {
        failures: 0,
        lastFailure: 0,
        status: 'CLOSED',
      });
    }
    return this.circuits.get(endpoint)!;
  }

  private recordFailure(endpoint: string, threshold: number): void {
    const circuit = this.getCircuit(endpoint);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= threshold) {
      circuit.status = 'OPEN';
    }
  }

  private resetCircuit(endpoint: string): void {
    this.circuits.set(endpoint, {
      failures: 0,
      lastFailure: 0,
      status: 'CLOSED',
    });
  }

  private checkCircuits(): void {
    const now = Date.now();
    for (const [endpoint, circuit] of this.circuits.entries()) {
      if (
        circuit.status === 'OPEN' &&
        now - circuit.lastFailure >= this.defaultConfig.resetTimeout
      ) {
        circuit.status = 'HALF_OPEN';
      }
    }
  }

  getCircuitStatus(endpoint: string): CircuitState['status'] {
    return this.getCircuit(endpoint).status;
  }
}

export const circuitBreaker = CircuitBreaker.getInstance(); 