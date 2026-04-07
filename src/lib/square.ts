import { SquareClient, SquareEnvironment } from 'square';

const isProduction = process.env.SQUARE_ENVIRONMENT === 'production';

export const squareClient = new SquareClient({
  token: isProduction
    ? process.env.SQUARE_ACCESS_TOKEN
    : process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
  environment: isProduction ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});

export const getSquareClient = () => squareClient;
