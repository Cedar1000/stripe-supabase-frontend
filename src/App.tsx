import { useState } from 'react';
import headphonesImg from './assets/products/headphones.webp';
import jordansImg from './assets/products/jordans.webp';
import tshirtsImg from './assets/products/t-shirts.webp';
import './App.css';

import { supabase } from './utils/supabase';

type CartItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  image: string;
  color: string;
  size: string;
  priceId?: string;
};

type CheckoutForm = {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
};

const initialCheckoutForm: CheckoutForm = {
  firstName: '',
  lastName: '',
  email: '',
  address: '',
};

const initialCartItems: CartItem[] = [
  {
    id: 'headphones',
    name: 'Sleek Headphones',
    description: 'Noise-cancelling over-ear headphones with premium comfort.',
    price: 39,
    quantity: 1,
    image: headphonesImg,
    color: 'Matte Black',
    size: 'One Size',
    priceId: 'price_1TeDr4F4E7zCE0XZYF3Q6QLp',
  },
  {
    id: 'jordans',
    name: 'Classic Jordans',
    description: 'Signature basketball sneakers with bold streetwear style.',
    price: 99,
    quantity: 1,
    image: jordansImg,
    color: 'White / Red',
    size: 'US 10',
    priceId: 'price_1TeDo8F4E7zCE0XZ0gCqcWhr',
  },
  {
    id: 'tshirt',
    name: 'Graphic Tee',
    description: 'Soft cotton tee with a modern fit and vivid print.',
    price: 20,
    quantity: 2,
    image: tshirtsImg,
    color: 'Cream',
    size: 'Large',
    priceId: 'price_1TeDubF4E7zCE0XZLj6fRh9B',
  },
];

const formatPrice = (value: number) => `$${value.toFixed(2)}`;

function App() {
  const [items, setItems] = useState<CartItem[]>(initialCartItems);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [formData, setFormData] = useState<CheckoutForm>(initialCheckoutForm);
  const [checkoutStatus, setCheckoutStatus] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string | null;
  }>({ status: 'idle', message: null });

  const updateQuantity = (id: string, delta: number) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  };

  const removeItem = (id: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
  };

  const handleInputChange = (field: keyof CheckoutForm, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const openCheckout = () => {
    setCheckoutStatus({ status: 'idle', message: null });
    setCheckoutOpen(true);
  };

  const closeCheckout = () => {
    setCheckoutOpen(false);
  };

  const handleCheckoutSubmit = async (event) => {
    event.preventDefault();

    if (items.length === 0) {
      setCheckoutStatus({ status: 'error', message: 'Your cart is empty.' });
      return;
    }

    if (items.some((item) => !item.priceId)) {
      setCheckoutStatus({
        status: 'error',
        message: 'One or more products are missing a price ID.',
      });
      return;
    }

    setCheckoutStatus({
      status: 'loading',
      message: 'Creating checkout session...',
    });

    const payload = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      address: formData.address,
      line_items: items.map((item) => ({
        price: item.priceId!,
        quantity: item.quantity,
      })),
    };

    const { data, error } = await supabase.functions.invoke<{ url?: string }>(
      'create-checkout-session',
      {
        body: payload,
      },
    );

    if (error) {
      setCheckoutStatus({ status: 'error', message: error.message });
      return;
    }

    setCheckoutStatus({
      status: 'success',
      message: data?.url
        ? 'Checkout session created. Redirecting...'
        : 'Checkout session created.',
    });

    if (data?.url) {
      window.location.href = data.url;
    }
  };

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const total = subtotal;

  return (
    <div className="cart-page">
      <header className="cart-header">
        <div>
          <p className="eyebrow">Shopping cart</p>
          <h1>Your order is ready</h1>
          <p className="intro">
            Review your items and complete checkout with confidence.
          </p>
        </div>
        <div className="cart-status">
          <span>{items.length} items</span>
          <span>Free shipping over $150</span>
        </div>
      </header>

      <main className="cart-grid">
        <section className="cart-items">
          <div className="section-heading">
            <h2>Cart items</h2>
            <p>Tap through each product for details and pricing.</p>
          </div>

          <ul>
            {items.map((item) => (
              <li key={item.id} className="cart-item">
                <img src={item.image} alt={item.name} />
                <div className="item-body">
                  <div className="item-meta">
                    <div>
                      <p className="item-name">{item.name}</p>
                      <p className="item-variant">
                        {item.color} · {item.size}
                      </p>
                    </div>
                    <p className="item-price">{formatPrice(item.price)}</p>
                  </div>
                  <div className="item-footer">
                    <div className="quantity-controls">
                      <button
                        type="button"
                        className="quantity-button"
                        onClick={() => updateQuantity(item.id, -1)}
                        disabled={item.quantity <= 1}
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        className="quantity-button"
                        onClick={() => updateQuantity(item.id, 1)}
                      >
                        +
                      </button>
                    </div>
                    <div className="item-actions">
                      <p className="item-total">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => removeItem(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="cart-summary">
          <div className="summary-card">
            <p className="summary-title">Order summary</p>
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatPrice(total)}</span>
            </div>

            <div className="summary-total">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            <button
              type="button"
              className="checkout-button"
              onClick={openCheckout}
            >
              Checkout now
            </button>
            <p className="summary-note">
              Secure payment, fast delivery, and easy returns.
            </p>
          </div>
        </aside>
      </main>

      {checkoutOpen && (
        <div className="cart-modal-backdrop" onClick={closeCheckout}>
          <div
            className="cart-modal"
            onClick={(event) => event.stopPropagation()}
            style={{ padding: '2.5rem' }}
          >
            <div className="modal-header">
              <div>
                <h2>Complete checkout</h2>
                <p>Enter shipping details to create your checkout session.</p>
              </div>
              <button
                type="button"
                className="modal-close-button"
                onClick={closeCheckout}
                aria-label="Close checkout modal"
              >
                ×
              </button>
            </div>

            <form className="modal-form" onSubmit={handleCheckoutSubmit}>
              <div className="modal-field">
                <label
                  htmlFor="firstName"
                  style={{ display: 'block', textAlign: 'left' }}
                >
                  First name
                </label>
                <input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(event) =>
                    handleInputChange('firstName', event.target.value)
                  }
                  required
                />
              </div>

              <div className="modal-field">
                <label
                  htmlFor="lastName"
                  style={{ display: 'block', textAlign: 'left' }}
                >
                  Last name
                </label>
                <input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(event) =>
                    handleInputChange('lastName', event.target.value)
                  }
                  required
                />
              </div>

              <div className="modal-field">
                <label
                  htmlFor="email"
                  style={{ display: 'block', textAlign: 'left' }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    handleInputChange('email', event.target.value)
                  }
                  required
                />
              </div>

              <div className="modal-field">
                <label
                  htmlFor="address"
                  style={{ display: 'block', textAlign: 'left' }}
                >
                  Shipping address
                </label>
                <input
                  id="address"
                  value={formData.address}
                  onChange={(event) =>
                    handleInputChange('address', event.target.value)
                  }
                  required
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="button-link"
                  onClick={closeCheckout}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="checkout-button"
                  disabled={checkoutStatus.status === 'loading'}
                >
                  {checkoutStatus.status === 'loading'
                    ? 'Processing…'
                    : 'Confirm payment'}
                </button>
              </div>

              {checkoutStatus.message && (
                <p className={`modal-status ${checkoutStatus.status}`}>
                  {checkoutStatus.message}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
